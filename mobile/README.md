# OpenDriver — app (iOS e Android)

Um app só para **passageiro e motorista** (troca de modo na aba Conta),
feito com Expo SDK 57 + Expo Router. Segue os requisitos e princípios de
[`../docs/requisitos.md`](../docs/requisitos.md) e
[`../docs/principios-ux.md`](../docs/principios-ux.md).

| Passageiro | Motorista |
| --- | --- |
| **Viagem** — mapa, "Para onde?", locais salvos/recentes, preço com pagamento e cashback já preenchidos, "Pedir corrida", acompanhamento em tempo real, Pix, avaliação | **Dirigir** — ficar online, oferta com contagem regressiva (Aceitar/Recusar), Cheguei → Iniciar → Finalizar, navegação no Waze/Maps |
| **Hub** — OpenDriverHub já logado | **Ganhos** — resumo, extrato e saque por Pix |
| **Conta** — pagamento, viagens, segurança, dados, excluir conta | **Hub** e **Conta** — cadastro (CNH, fotos, veículo, Pix) |

## Estrutura

```
src/app/            rotas (Expo Router): passenger/ (abas), drive/ (abas), telas de pilha
src/features/       painéis da corrida (passageiro e motorista)
src/screens/        telas compartilhadas pelas duas áreas (Hub, Conta)
src/api/            cliente HTTP (refresh single-flight), endpoints e tipos da API
src/context/        sessão (AuthContext), tempo real (Socket.IO), React Query
src/services/       localização em 2º plano, push, gravação de segurança
src/components/     UI (mapa MapLibre/OSM, painéis, formulários)
```

A tela nunca decide sozinha o que pode ser feito numa corrida: ela mostra
as `actions` que a API devolve em cada estado (UX07/UX14).

## Rodar

O app usa módulos nativos (mapa, localização em segundo plano, gravação),
então precisa de um **development build** — não roda no Expo Go.

```bash
npm ci
# API local (ver backend/README.md) — no celular use o IP da máquina, não localhost
EXPO_PUBLIC_API_URL=http://192.168.0.10:5100 npx expo run:android   # ou run:ios
```

Variáveis (`EXPO_PUBLIC_*` entram no bundle; as de produção ficam em `eas.json`):

| Variável | Uso |
| --- | --- |
| `APP_VARIANT` | `development` \| `preview` \| `production` (muda nome e bundle id) |
| `EXPO_PUBLIC_API_URL` | API do OpenDriver (https fora de dev) |
| `EXPO_PUBLIC_HUB_URL` | site do OpenDriverHub aberto na aba Hub |
| `EXPO_PUBLIC_MAP_STYLE_URL` | estilo MapLibre com tiles OSM próprios (https) |
| `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` | opcional; padrão `API/legal/privacidade` e `API/legal/termos` |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | contato de suporte |
| `EAS_PROJECT_ID`, `EAS_OWNER` | projeto EAS (necessário para push) |
| `IOS_BUNDLE_ID`, `ANDROID_PACKAGE` | padrão `br.com.opendriver.app` |

Builds `preview`/`production` falham de propósito se a API, o Hub ou o
estilo do mapa não forem https.

## Qualidade

```bash
npm run typecheck
npm run lint
npm test                 # unitários
npm run export:check     # gera os bundles iOS/Android (todas as rotas compilam)
npm run test:e2e         # camada de dados do app contra a API real (E2E_API_URL, E2E_DATABASE_URL)
```

## Build e publicação (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest init                        # cria o projeto; copie o id para EAS_PROJECT_ID
npx eas-cli@latest build -p all --profile preview      # teste interno (APK / ad hoc)
npx eas-cli@latest build -p all --profile production   # AAB + IPA
npx eas-cli@latest submit -p android --profile production
npx eas-cli@latest submit -p ios --profile production
```

Antes do primeiro `submit`, preencha em `eas.json` o `ascAppId` (App Store
Connect) e coloque a chave de serviço do Google Play em
`secrets/google-play-service-account.json` (fora do git). Credenciais de
assinatura ficam no EAS. O checklist completo das lojas está em
[`../docs/publicacao-lojas.md`](../docs/publicacao-lojas.md).
