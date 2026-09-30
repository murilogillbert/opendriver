# Publicação na App Store e no Google Play — checklist

O que já está pronto no código está marcado com ✅. Os itens ⬜ dependem de
contas, conteúdo ou decisões do negócio.

## Infraestrutura

- ✅ API do OpenDriver no ar, com o mesmo `JWT_SECRET` do hub,
  `DATA_ENCRYPTION_KEY` própria e migrations aplicadas. Hoje rodando em servidor
  de teste (Coolify, domínio `sslip.io`) em paralelo ao servidor de produção
  atual — `api-app.opendriver.com.br` ainda aponta pro servidor antigo (sem
  mapa) até o corte final ser feito.
- ✅ **OSRM**, **Nominatim** (extrato Centro-Oeste: MT/MS/GO/DF) e servidor de
  **tiles** (MapLibre) no ar e testados de ponta a ponta no servidor novo —
  rota real, busca de endereço real, tiles reais (`tiles.opendriver.com.br`).
  Cobertura nacional completa (fora Centro-Oeste) ainda não está no escopo.
- ✅ Bucket privado `opendriver-private` no MinIO (servidor novo).
- ⬜ Segundo webhook do Asaas apontando para a API do OpenDriver — pagamento
  hoje é `mock` (simulado) em ambos os servidores, de propósito, até termos as
  credenciais Asaas reais.
- ✅ `VITE_OPENDRIVER_API_URL` no build do painel do hub e `CORS_ORIGINS` da API.

## Contas e identidade

- ⬜ Conta Apple Developer (organização) e Google Play Console — ainda não
  confirmadas/criadas.
- ✅ Projeto EAS criado (`EAS_PROJECT_ID` configurado). ⬜ `ascAppId` em
  `eas.json` e chave de serviço do Google Play em `mobile/secrets/` — ambos
  ainda placeholder, dependem da conta Apple/Google acima.
- ✅ Ícones do app (1024×1024, todas as variantes) já corretos pras lojas.
  ⬜ `mobile/assets/brand/logo-source.png` (191×185) continua baixa resolução —
  só importa se for regenerar os ícones a partir dele de novo.
- ✅ Bundle id / package `br.com.opendriver.app` (variantes `.dev`/`.preview`).

## Conteúdo das lojas

- ✅ Política de privacidade e termos públicos. ⬜ Hoje com texto de exemplo
  (`LEGAL_COMPANY`/`LEGAL_CONTACT_EMAIL` fictícios, por decisão consciente
  enquanto testamos) — **precisa da razão social e e-mail reais antes de
  publicar de verdade**.
- ⬜ Screenshots (iPhone 6,7" e 6,5"; Android telefone), descrição, palavras-chave,
  categoria **Viagens / Mapas e navegação**, classificação etária.
- ⬜ Conta de demonstração para a revisão (passageiro e motorista **aprovado**)
  e instruções: a revisão da Apple precisa conseguir pedir e aceitar uma
  corrida. Sugestão: uma região de teste com um motorista de demonstração online.

## Requisitos de revisão já atendidos no app

- ✅ **Exclusão de conta dentro do app** (Conta → Excluir minha conta): anonimiza,
  apaga documentos e encerra sessões (App Store 5.1.1(v); Google Play).
- ✅ Textos de permissão em português explicando o uso (localização "em uso" e
  "sempre", microfone, câmera, fotos).
- ✅ Localização em segundo plano **somente para motorista online**, com
  notificação persistente no Android (serviço em primeiro plano do tipo
  `location`) e indicador azul no iOS; fica offline → para.
- ✅ Microfone só com a gravação de segurança ativada pelo usuário (opt-in),
  com aviso "Gravando áudio" durante a viagem.
- ✅ Pagamentos de corrida (serviço físico) via Asaas, fora do IAP — permitido
  (App Store 3.1.3(e)).
- ✅ Privacy manifest do iOS, `usesNonExemptEncryption: false` (só HTTPS padrão),
  permissões Android desnecessárias bloqueadas.
- ✅ Suporte e links legais em Conta → Sobre e suporte.

## Declarações que as lojas vão pedir

**Google Play — Permissão de localização em segundo plano** (formulário +
vídeo curto): "Motoristas parceiros, enquanto estão online, compartilham a
localização com o app em segundo plano para receber ofertas de corridas
próximas e para que o passageiro acompanhe o carro. O compartilhamento para
quando o motorista fica offline." Grave o vídeo: ficar online → notificação
"Você está online" → bloquear a tela → oferta chegando.

**Google Play — Tipo de serviço em primeiro plano:** `location`, pelo mesmo
motivo.

**Segurança dos dados (Google) / Privacidade do app (Apple):**

| Dado | Coletado | Finalidade | Vinculado ao usuário |
| --- | --- | --- | --- |
| Nome, e-mail, telefone, CPF | Sim | Funcionalidade do app, conta | Sim |
| Localização precisa (inclusive em 2º plano, só motorista) | Sim | Funcionalidade do app | Sim |
| Informações de pagamento (token do cartão no processador) | Sim | Compras | Sim |
| Fotos (CNH, selfie, CRLV — só motorista) | Sim | Verificação de identidade | Sim |
| Áudio (opcional, gravação de segurança) | Sim | Segurança | Sim |
| Identificador do aparelho (token de push) | Sim | Funcionalidade do app | Sim |
| Rastreamento para publicidade | **Não** | — | — |

Todos os dados trafegam criptografados; o usuário pode pedir a exclusão pelo
app.
