# Publicação na App Store e no Google Play — checklist

O que já está pronto no código está marcado com ✅. Os itens ⬜ dependem de
contas, conteúdo ou decisões do negócio.

## Infraestrutura

- ⬜ API do OpenDriver no ar em `https://api-app.opendriver.com.br` (ver
  [`backend/README.md`](../backend/README.md)), com o mesmo `JWT_SECRET` do hub,
  `DATA_ENCRYPTION_KEY` guardada fora do servidor e migrations aplicadas.
- ⬜ Instâncias próprias de **OSRM** (rotas) e **Nominatim** (endereços) com o
  mapa do Brasil, e um servidor de **tiles** com estilo MapLibre
  (`EXPO_PUBLIC_MAP_STYLE_URL`). Os servidores públicos do OpenStreetMap não
  permitem uso comercial. Sem OSRM a API usa rota estimada (o preço continua
  válido).
- ⬜ Bucket privado `opendriver-private` no MinIO.
- ⬜ Segundo webhook do Asaas apontando para a API do OpenDriver.
- ⬜ `VITE_OPENDRIVER_API_URL` no build do painel do hub (telas Admin → OpenDriver)
  e o domínio do painel em `CORS_ORIGINS` da API.

## Contas e identidade

- ⬜ Conta Apple Developer (organização) e Google Play Console.
- ⬜ Projeto EAS (`eas init`) → `EAS_PROJECT_ID`; `ascAppId` em `eas.json`;
  chave de serviço do Google Play em `mobile/secrets/`.
- ⬜ Logo em alta resolução: a atual tem 191×185 px. Substitua
  `mobile/assets/brand/logo-source.png` por uma versão ≥ 1024 px e rode
  `python3 mobile/scripts/generate-icons.py`.
- ✅ Bundle id / package `br.com.opendriver.app` (variantes `.dev`/`.preview`).

## Conteúdo das lojas

- ✅ Política de privacidade e termos públicos: `https://api-app.opendriver.com.br/legal/privacidade`
  e `/legal/termos`. ⬜ **Revisar o texto com o jurídico** e definir
  `LEGAL_COMPANY` (razão social) e `LEGAL_CONTACT_EMAIL` (encarregado/DPO) na API.
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
