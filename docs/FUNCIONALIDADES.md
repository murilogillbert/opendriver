# Open Driver — Documento de Funcionalidades

> Documento para stakeholders. Descreve, em linguagem não-técnica, o que a plataforma faz hoje, quem usa cada parte e como tudo se conecta.

---

## 1. O que é o Open Driver

O **Open Driver** (https://opendriver.com.br) é um clube de economia para motoristas. A plataforma reúne **parceiros** (postos, oficinas, farmácias, mercados, prestadores de serviço, lojas digitais) que oferecem **vouchers, produtos e serviços com desconto** ao público cadastrado. Toda compra feita gera **cashback** que retorna como saldo na carteira do cliente para uso em compras futuras.

A plataforma se divide em quatro experiências:

| Experiência | URL | Quem usa |
|---|---|---|
| Site público / catálogo | `/` | Visitante e cliente logado |
| Conta do cliente | `/minha-conta` | Cliente final |
| Painel administrativo | `/admin` | Equipe Open Driver |
| Terminal do parceiro | `/parceiros` | Operador do parceiro (balcão) |

Há também páginas auxiliares: login (`/entrar`), checkout (`/checkout/...`) e vitrine pública via QR code (`/c/{token}`).

---

## 2. Site público — `/`

Página principal voltada para conversão de visitantes em clientes.

### 2.1 Hero e métricas ao vivo

- Resumo do clube com contadores de **ofertas no catálogo**, **parceiros ativos** e **categorias**.
- Painel lateral com a soma da economia mensal do catálogo, distribuída pelas 5 maiores categorias. Tudo calculado em tempo real a partir dos produtos publicados — não há números fixos no código.

### 2.2 Catálogo de ofertas

Lista de produtos publicados pelos parceiros, com imagem, descrição, preço original riscado, preço com desconto, badge da economia e tipo da oferta (voucher, serviço, produto físico, produto digital, benefício recorrente, assinatura ou combo).

**Filtros disponíveis:**
- Por categoria (Combustível, Alimentação, Farmácia, Automotivo, Digital, etc.)
- Por parceiro (lista todos os parceiros que têm pelo menos uma oferta ativa)

**Vitrines temáticas** (renderizadas só se têm conteúdo):
- Serviços mais utilizados
- Vouchers em destaque
- Benefícios com maior economia

Cada card tem dois caminhos: **Comprar agora** (envia para o checkout, redirecionando para login se necessário) e **Ver detalhes** (mostra a descrição completa).

### 2.3 Lojas próximas

Seção dedicada exibida antes do rodapé. Lista os pontos físicos dos parceiros cadastrados:
- **Sem permissão de localização**: mostra os 6 pontos mais recentes.
- **Com permissão concedida**: ordena por distância, mostra "320 m" ou "1,4 km" em cada card.

Cada card oferece:
- **Abrir vitrine**: se o local tem QR check-in ativo, leva direto para `/c/{token}` (vitrine do balcão).
- **Ver produtos do parceiro**: filtra o catálogo para esse parceiro.
- **Como chegar**: link para o Google Maps com as coordenadas.

### 2.4 Conversão

Banner final reforçando o "Crie sua conta" (leva ao `/entrar`).

---

## 3. Cadastro e login — `/entrar`

- Cadastro do cliente exige nome, CPF, e-mail, telefone, senha e endereço completo (CEP, logradouro, número, bairro, cidade, UF). O endereço é necessário porque pedidos físicos usam-no para entrega.
- Login com e-mail + senha. Limites de segurança em vigor:
  - **Rate limit**: 10 tentativas por minuto por IP.
  - **Bloqueio**: após 10 tentativas falhadas seguidas, conta fica trancada por 15 minutos.
  - **Tokens de sessão**: JWT com versão; logout invalida todos os tokens emitidos.
  - **Logs de auditoria** em todas as tentativas (sucesso ou falha).
- Tipos de usuário no sistema: `passageiro` (cliente final), `motorista` (legado, mesmo papel), `parceiro` (operador de balcão), `admin` (equipe Open Driver).

---

## 4. Conta do cliente — `/minha-conta`

Dashboard completo do cliente logado. A página é o ponto principal de pós-venda — onde ele consulta saldo, voucher, status de pagamento e acompanha pedidos.

### 4.1 Carteira de cashback (hero)

Bloco de destaque no topo:
- **Saldo disponível** em letras grandes.
- **Tier atual** (Bronze/Prata/Ouro) e **taxa efetiva** (2%, 5% ou 8%).
- **Cashback expirando nos próximos 30 dias** (alerta amarelo se houver).
- **Últimas movimentações**: crédito, débito, expirado, estornado.
- Botão **"Usar agora no catálogo"** que leva direto para a home.
- Link **"Como funciona"** que rola até o guia de 3 passos abaixo.

### 4.2 KPIs do cliente

- Economia acumulada (soma de `economia_total` em pedidos confirmados/enviados/entregues).
- Total de pedidos.
- Pagamentos aprovados.
- Nível atual.

### 4.3 Vouchers digitais

Cards grandes para cada compra aprovada que tem voucher digital (`OD-XXXXXXXX`):
- Imagem do produto, nome, status.
- Código `OD-XXXX` em destaque com botão **"Copiar código"**.
- Texto contextual explicando onde aplicar o voucher.
- Regras de uso, se o produto tem.

### 4.4 Benefícios para resgate presencial

Cards para cada `benefit_activation` ativa (serviços, vouchers presenciais, combos):
- Token de **12 caracteres** + **QR code** gerado no navegador.
- Botão **"Mostrar no balcão"** abre o QR em **tela cheia**, pronto para o parceiro escanear ou ler o token impresso embaixo.
- Contador `usos / limite` (ex: `0/1` ou `2/5`).
- Data de expiração se houver.
- Status colorido: ativo (verde), esgotado/expirado/cancelado (vermelho).
- Lista colapsável com benefícios já usados ou expirados.

### 4.5 Como funciona o cashback

Bloco didático com 3 passos:
1. **Acumula** — cada compra aprovada credita 2% (Bronze), 5% (Prata) ou 8% (Ouro). Vence em 90 dias.
2. **Usa no checkout** — marque "Usar meu cashback" no próximo pedido. Se cobrir 100%, o pedido é aprovado sem passar pelo Mercado Pago.
3. **Voucher e QR** — compras digitais já saem com código OD-XXXX; presenciais geram token + QR.

### 4.6 Histórico de pedidos

Lista de todos os pedidos com:
- Imagem, nome do produto, tipo de oferta.
- Status do pedido e do pagamento (aguardando, aprovado, recusado, estornado).
- "Usou R$ X de cashback" e "Ganhou R$ Y de cashback" em cada linha.
- Voucher (se houver).
- Botão **"Verificar pagamento"** para pedidos pendentes (forca uma reconciliação com o Mercado Pago).

### 4.7 Notificações e cadastro

- Painel de últimas notificações geradas pelo sistema (pagamento confirmado, pedido enviado, cupom usado, reembolso).
- Dados cadastrais.
- Endereço.
- Permissão de localização (concede/revoga consentimento para alertas geo).

---

## 5. Compra — fluxo do cliente

Há dois fluxos que convivem.

### 5.1 Compra unitária — `/checkout/{produto-id}`

Para qualquer produto do catálogo. O cliente:
1. Clica em "Comprar agora" no card.
2. Vai pra `/checkout/{id}` (se não estiver logado, é redirecionado para `/entrar` e volta).
3. Vê o resumo do produto (imagem, preço, prazo, regras).
4. Decide se quer **usar cashback** (toggle com input do valor; o sistema limita ao saldo e ao preço do produto).
5. Escolhe **Pix**, **Crédito** ou **Débito**.
   - Se cashback cobrir 100%: o pedido é aprovado direto, **sem chamar o Mercado Pago**.
   - Se cobrir parte: paga o restante pelo MP. A parte do cashback fica registrada e debitada da carteira.
6. Recebe confirmação na tela com QR Pix ou status do cartão.

### 5.2 Compra via QR de check-in (carrinho) — `/c/{token}` → `/checkout/cart`

Voltada para parceiros físicos. O cliente:
1. Escaneia o QR no balcão do parceiro → abre `/c/{token}`.
2. Vê a vitrine do parceiro: nome, local, produtos vinculados àquele QR.
3. **Adiciona itens ao carrinho** com botões `+` e `−` (até 20 unidades por item).
4. Footer fixo mostra "Carrinho (N itens) • R$ X • Finalizar compra".
5. Clica e vai para `/checkout/cart` (cart persistido em localStorage, sobrevive ao login).
6. Aplica cashback se quiser.
7. Paga no Pix/cartão; o sistema cria **uma transação Mercado Pago** com o total e **vários pedidos internos** (`product_orders`) com mesmo `payment_reference` + `cart_id`. Cada pedido recebe sua fatia proporcional de cashback creditado.

---

## 6. Sistema de cashback

Núcleo da retenção. Resumo das regras:

### 6.1 Acúmulo

- Cada compra **aprovada** dispara o crédito automaticamente.
- A taxa é a maior entre o **tier do cliente** e o **percentual configurado no produto**:
  - Bronze (default): **2%**
  - Prata (≥5 compras no mês): **5%**
  - Ouro (≥10 compras no mês): **8%**
  - O admin pode setar `cashback_percent` por produto pra impulsionar uma oferta específica.
- Crédito calculado sobre o **valor pago em dinheiro** (excluindo cashback usado no próprio pedido — não credita cashback em cima de cashback).

### 6.2 Uso

- No checkout, o cliente vê o saldo e marca quanto quer usar.
- O valor é **debitado antes** de chamar o Mercado Pago. Se a chamada falhar, devolve.
- Se cobrir 100% do pedido, **pula** o Mercado Pago e marca aprovado direto.
- Funciona em compra unitária e em carrinho.

### 6.3 Expiração (90 dias)

- Cada crédito tem `expires_at = data + 90 dias`.
- Job diário roda por usuário e calcula: se `cashback_balance > soma dos créditos ainda dentro do prazo`, a diferença é "dinheiro velho que sobrou" e é expirado proporcionalmente.
- Cliente vê na carteira "expira nos próximos 30 dias" para se antecipar.

### 6.4 Reembolso de cashback

Quando um pedido é reembolsado:
- O **cashback usado** volta para a carteira (transação tipo `estornado`).
- O **cashback creditado** é estornado proporcionalmente, limitado ao saldo atual (se o cliente já gastou, só remove o que ainda tem).

---

## 7. Vouchers e benefícios

Dois conceitos distintos:

### 7.1 Voucher digital (`OD-XXXXXXXX`)

- Gerado em `product_orders.voucher_code` quando o pedido é aprovado e o produto tem entrega digital.
- 8 caracteres hexadecimais maiúsculos, prefixados por `OD-`.
- Cliente usa no parceiro online (site, app, código de cupom). O parceiro pode também digitar esse código no terminal Open Driver para confirmar uso.

### 7.2 Token de resgate presencial (12 caracteres)

- Gerado em `benefit_activations.redemption_token` quando o produto é presencial (`offer_type` em `servico`, `voucher`, `beneficio_recorrente`, `combo`, ou `delivery_method='presencial'`).
- 12 caracteres alfanuméricos sem símbolos confusos (sem 0/O ou 1/I).
- Cliente apresenta o **QR (gerado no celular)** ou **digita os 12 chars** no terminal do parceiro.

### 7.3 Regra de uso único

- **Benefícios recorrentes** (`offer_type='beneficio_recorrente'`) — múltiplos resgates respeitando o `limite_resgates` configurado no produto (NULL = ilimitado).
- **Todos os outros tipos** — uso único. Após o parceiro validar uma vez, o status passa para `esgotado` e novas tentativas são recusadas.

### 7.4 Expiração

- Activations com `expires_at` definido viram `expirado` automaticamente quando a data passa (job a cada 6 horas).

---

## 8. Pagamentos

Todos os pagamentos passam pelo Mercado Pago, exceto os que são 100% cobertos por cashback.

### 8.1 Métodos suportados

- **Pix** (geração de QR Code copia-e-cola, com cópia automática).
- **Cartão de crédito** (com parcelamento, via brick do MP).
- **Cartão de débito** (via brick do MP).

### 8.2 Reconciliação automática

- Webhook do MP envia notificações em cada mudança de status. A API valida com **HMAC-SHA256** e tolerância de 5 minutos contra ataque de replay.
- Para evitar duplicações, o `reconcile` é envolvido em transação com `UPDLOCK` na linha do pedido — chamadas concorrentes não conseguem disparar o crédito de cashback duas vezes.
- Se o webhook é perdido, um job horário busca pedidos pendentes há mais de 15 minutos e consulta o MP diretamente.

### 8.3 Reembolso (manual e automático)

Dois caminhos:

**Manual (admin):**
- Botão "Reembolsar" na lista de pedidos do admin.
- Sistema chama o **MP primeiro** (`POST /v1/payments/{id}/refunds`) para devolver o dinheiro ao cartão/Pix do cliente.
- Se o MP aceita: marca o pedido como `refunded`, restaura estoque, devolve cashback usado, faz clawback do cashback creditado, cancela activations relacionadas, notifica cliente.
- Se o MP recusa: aborta sem mexer no banco e registra o motivo em `payment_events`.

**Automático (webhook):**
- Quando o cliente pede estorno pelo banco (chargeback) ou MP estorna unilateralmente, o webhook chega como `refunded`/`charged_back`. O `reconcile` aciona o mesmo rollback interno (sem chamar MP de novo, já que ele já fez a devolução).

### 8.4 Mensagem ao cliente

- Pix volta em poucos minutos.
- Cartão pode levar até 2 faturas para aparecer.
- Mensagem padrão na notificação: *"O valor de R$ X será devolvido no mesmo meio de pagamento usado na compra."*

---

## 9. Painel administrativo — `/admin`

Ferramenta interna da equipe Open Driver. Login com conta `tipo_usuario='admin'`.

### 9.1 Dashboard

- Receita vendida, economia gerada, pedidos do mês, usuários, conversão da home.
- Mix comercial: receita por tipo de oferta (físico, digital, serviço, voucher).
- Fila operacional: leads ativos, alertas geo pendentes, contas a receber abertas.
- Métricas de bot e de progressão de níveis.

### 9.2 Catálogo

- Lista todos os produtos com filtros por **categoria** e **parceiro** (incluindo "Sem parceiro" para detectar órfãos).
- Busca textual no nome/categoria/parceiro/status.
- **Criar/Editar produto**: nome, descrição, tipo de oferta, forma de entrega, preços, estoque, gallery_urls, prazo, regras, **cashback_percent específico**, status (ativo/pausado/esgotado/rascunho), categoria, **parceiro vinculado**.
- **Pausar** (via select de status) ou **Excluir** (com confirmação): hard delete se não há pedidos vinculados, soft delete (`deleted_at`) caso contrário.
- "Ativar todos os benefícios" para sair do estado rascunho em massa.

### 9.3 Pedidos

- Lista todos os pedidos com cliente, produto, valor, cashback usado/creditado, voucher, status.
- Mudar status (pendente → confirmado → enviado → entregue → cancelado).
- **Botão "Reembolsar"** em pedidos aprovados — chama MP, gera estornos.

### 9.4 Usuários

Lista de clientes com nome, contato, cidade, nível atual, aquisições do mês, total economizado, status.

### 9.5 Parceiros

- Cadastro de novo parceiro (razão social, nome fantasia, responsável, email, cidade, UF).
- Quando o parceiro é criado **com email**, o sistema **automaticamente cria uma conta de operador** (`tipo_usuario='parceiro'`, senha `123456`, vinculada ao parceiro). O toast pós-criação mostra o login para repassar ao operador.
- Para parceiros legados (cadastrados antes desse fluxo) ou para reset de senha: botão **"Gerar/Resetar senha"** na linha do parceiro restaura a senha para `123456` e força troca no próximo login.

### 9.6 Locais de parceiros

Cadastro de pontos físicos com lat/long e raio em metros. Esses locais alimentam a seção "Lojas próximas" da home e os alertas de geofence.

### 9.7 Check-in QR

- Criação de QR codes públicos para cada parceiro/local.
- Selecionar **parceiro** filtra automaticamente os locais e os produtos elegíveis (somente do parceiro escolhido, e somente os ativos).
- Vinculação de produtos via **checkbox** (não mais texto livre).
- Tabela mostra cada QR com **imagem inline**, botão **"Baixar PNG"** (gerado no navegador), URL, contagem de produtos e de scans, botão de pausar/ativar.

### 9.8 Validação manual de tokens

Tela operacional onde o admin pode confirmar resgates digitando o token de 12 chars (mesma função do terminal do parceiro, com flexibilidade total — o admin pode redirecionar a comissão para outro parceiro se necessário).

### 9.9 Benefícios ativos

Lista de todas as `benefit_activations` ativas, com cliente, produto, token, voucher, contagem de resgates, status.

### 9.10 Alertas geo

Quando um cliente que tem benefício ativo entra na geofence de um parceiro, o sistema gera um alerta. Esta tela permite notificar, confirmar ou descartar cada alerta.

### 9.11 Comissões e contas a receber

- Cada resgate por parceiro gera um `receivable` com o valor de referência.
- Tela de "Contas a receber" lista cada item por parceiro/status (pendente, fechado, pago, cancelado).
- Admin pode mudar o status (fechar, marcar como pago, cancelar).

### 9.12 Cashback (visão consolidada)

- Saldo total na plataforma (soma de todas as carteiras).
- Total creditado, debitado, expirado e estornado.
- Top 20 usuários por saldo.

### 9.13 Auditoria

Lista de toda atividade administrativa (login, criação, edição, exclusão, refund, redeem, etc.) com ator, ação, entidade, IP e payload em JSON. Aba complementar com os webhooks do Mercado Pago recebidos.

### 9.14 Bot e leads

- Histórico das conversas captadas pelo assistente e WhatsApp.
- Pipeline de leads (novo → enviado_ao_parceiro → convertido/perdido).

---

## 10. Terminal do parceiro — `/parceiros`

Interface dedicada para o operador do balcão validar cupons.

### 10.1 Acesso

- Login com email e senha cadastrados pela Open Driver.
- **Token de sessão isolado** (não compartilha com o cliente final/admin).
- **Primeiro acesso obriga a troca de senha** (a senha padrão `123456` só vale uma vez).
- Logo após login bem-sucedido com `password_must_change=true`, o terminal renderiza a tela de troca antes de qualquer operação.

### 10.2 Validar cupom

Tela principal:
- Input grande do token, autoFocus, em maiúsculas. Aceita **qualquer um dos formatos**:
  - 12 caracteres (`K7M3LFXP9TQR`) — token de resgate.
  - `OD-XXXXXXXX` — voucher digital.
- Botão **"Buscar voucher"** chama a API e exibe um card de **preview**:
  - Produto, tipo de oferta.
  - Primeiro nome do cliente (privacidade no balcão).
  - Valor de referência.
  - Contagem `usos / limite` e expiração.
  - Estado: **Usável** (verde) ou status de bloqueio (vermelho com motivo: expirado, esgotado, cancelado).
- Botão **"Confirmar resgate"** registra a operação. Toast de sucesso, campo limpo, lista de últimos resgates atualizada.

### 10.3 Estatísticas

- Resgates hoje.
- Resgates no mês.
- Total a receber (soma de receivables pendentes/fechados).
- Total já pago (soma de receivables pagos).

### 10.4 Últimos resgates

Lista dos 15 últimos resgates do parceiro com produto, cliente (nome completo, sem privacidade aqui pois é histórico interno), data/hora e valor.

### 10.5 Segurança operacional

- Operador **não consegue** validar cupom de outro parceiro (mesmo se digitar um token válido de outra empresa, a API recusa com `voucher_belongs_to_another_partner`).
- Operador **não consegue** operar enquanto a senha padrão estiver ativa.
- Cada resgate gera linha em `audit_logs`.

---

## 11. Funcionalidades de retenção e gamificação

### 11.1 Sistema de níveis

Calculado por usuário com base nas aquisições do mês:
- **Bronze** — padrão para todos os clientes (2% cashback).
- **Prata** — ≥5 compras confirmadas no mês (5%).
- **Ouro** — ≥10 compras confirmadas no mês (8%).

A regra mensal é resetada no primeiro dia do mês.

### 11.2 Geofence e alertas

- Cliente concede consentimento de localização em `/minha-conta`.
- App envia eventos (`enter`, `dwell`, `exit`) para a API.
- Servidor cruza com `partner_locations` ativos dentro de 5km. Se encontra cliente dentro do raio com benefício ativo, gera um `benefit_match_alert`.
- Admin acompanha em "Alertas geo" e pode notificar/confirmar/descartar.

### 11.3 Notificações internas

Eventos que disparam notificação ao cliente:
- Pagamento aprovado.
- Pedido enviado/entregue.
- Pagamento estornado/reembolsado.
- Cashback creditado/expirado.
- (Configurável: alertas de proximidade quando há benefício ativo num parceiro próximo).

### 11.4 Bot e captação de leads

- Assistente flutuante (FloatingAssistant) na home capta intenções de uso.
- Webhook de WhatsApp recebe interações e cria leads ou bot_interactions.
- Admin acompanha o pipeline em tempo real.

---

## 12. Operações automáticas (jobs)

Rodam em background no boot da API:

| Job | Frequência | O que faz |
|---|---|---|
| **Webhook retry** | A cada hora | Reconcilia pedidos pendentes há mais de 15min consultando o MP |
| **Cashback expiration** | A cada 24h | Expira créditos de cashback com mais de 90 dias |
| **Benefit expiration** | A cada 6h | Marca activations expiradas (fora do prazo) como `expirado` |

Podem ser desligados com a env var `DISABLE_BACKGROUND_JOBS=1` (útil em ambiente de desenvolvimento).

---

## 13. Segurança e compliance

### 13.1 Autenticação

- Senhas armazenadas com **bcrypt** (cost 12).
- JWT com **token_version**: logout invalida globalmente.
- TTL diferenciado: admin **2h**, usuário comum **7d**.
- Bootstrap do primeiro admin requer **token compartilhado** validado em tempo constante (`crypto.timingSafeEqual`).

### 13.2 Configuração fail-closed em produção

A API recusa subir se variáveis críticas tiverem valor de placeholder:
- `JWT_SECRET` (mínimo 32 chars).
- `ADMIN_BOOTSTRAP_TOKEN`.
- `SQLSERVER_PASSWORD`.
- `CORS_ORIGIN` (wildcard `*` é proibido).

### 13.3 Webhooks

Validação **HMAC-SHA256** do header `X-Signature` do Mercado Pago, com tolerância de 5 minutos para timestamp (replay protection).

### 13.4 Idempotência

Operações sensíveis (reconcile de pagamento, crédito de cashback, criação de receivable) são envolvidas em transação com lock de linha (`UPDLOCK`). Webhooks duplicados não causam efeitos colaterais.

### 13.5 Auditoria

Toda operação administrativa gera linha em `audit_logs` com ator, ação, entidade, payload em JSON e IP. Lista é consultável no admin.

### 13.6 Privacidade

- Terminal mostra apenas o primeiro nome do cliente (operador no balcão).
- Histórico interno traz o nome completo (apenas para o próprio parceiro).
- Endereço só é exigido em compras com entrega física.

---

## 14. Stack técnica resumida

- **Backend**: Node.js 20 + Fastify + TypeScript. Compila para `dist/`.
- **Frontend**: React 18 + Vite + Tailwind. Build estático servido via Nginx.
- **Banco**: SQL Server 2022 (container Docker).
- **Pagamentos**: Mercado Pago (REST API v1 + webhooks).
- **Infra**: Docker Compose + Nginx + Cloudflare Tunnel.
- **Qualidade**: TypeScript strict em toda a base; build do CI roda `tsc --noEmit` em todos os módulos.

---

## 15. Roadmap (sugestões de evolução)

Itens já mapeados como próximos passos naturais:

1. **Auto-migrate no boot da API** — aplicar migrations pendentes automaticamente para evitar 500 quando o código nasce na frente do schema.
2. **Recuperação de senha para clientes** — fluxo de reset por email já tem coluna no banco (`reset_token`), falta o envio de email e o formulário público.
3. **Página de detalhes do produto** — hoje "Ver detalhes" mostra a descrição como toast; vale virar uma rota dedicada com galeria, prazo, regras e CTA.
4. **App mobile / PWA** — terminal do parceiro e conta do cliente já são mobile-first, mas falta um manifest + service worker para instalar como PWA.
5. **Relatórios financeiros para parceiros** — terminal hoje mostra "a receber" e "pago" agregado; adicionar exportação CSV/PDF dos resgates.
6. **Bot integrado ao WhatsApp Business** — schema de `bot_interactions` está pronto, falta o conector formal.
7. **Marketing automation** — dispará campanhas baseadas em saldo prestes a expirar, aniversário, ofertas próximas geograficamente.

---

## 16. Glossário

| Termo | O que é |
|---|---|
| Activation | Linha em `dbo.benefit_activations`. Liga um cliente a um benefício comprado, com token de resgate, status, contagem de usos. |
| Cart ID | Identificador que agrupa pedidos pagos juntos numa mesma transação MP (carrinho). |
| Cashback | Saldo em reais que o cliente acumula a cada compra aprovada e usa como desconto em compras futuras. |
| Check-in QR | QR code físico no balcão de um parceiro. Aberto pelo cliente, mostra a vitrine do parceiro pra montar carrinho. |
| Receivable | Conta a receber gerada quando um parceiro confirma um resgate. Open Driver usa para fechar o pagamento dele. |
| Redemption | Cada uso de uma activation. Fica registrado em `dbo.redemptions` com cliente, parceiro, método e valor. |
| Tier | Nível do cliente (Bronze/Prata/Ouro). Define a taxa de cashback. |
| Voucher code | Código curto `OD-XXXXXXXX` impresso para o cliente, válido para vouchers digitais. |
