# Arquitetura — OpenDriver

Documento técnico que traduz os requisitos ([requisitos.md](requisitos.md)) e
os princípios de UX ([principios-ux.md](principios-ux.md)) em decisões de
implementação. Toda decisão abaixo referencia os IDs RF/UX que atende.

## 1. Visão geral

```
┌──────────────┐   HTTPS + WebSocket   ┌────────────────────┐
│ App mobile   │ ────────────────────► │ OpenDriver API     │
│ (Expo / RN)  │                       │ Node + Express +   │──┐
│ passageiro + │ ◄──── Socket.IO ───── │ Socket.IO + Prisma │  │
│ motorista    │                       └────────────────────┘  │ mesmo
│              │   WebView c/ sessão   ┌────────────────────┐  │ Postgres
│  aba "Hub" ──┼─────────────────────► │ OpenDriverHub (web)│  │
└──────────────┘   (token do app)      │ + API do hub       │──┘
                                        └────────────────────┘
```

| Peça | Pasta | Stack |
| --- | --- | --- |
| API do OpenDriver | `backend/` | Node 22, Express 5, TypeScript, Prisma 6, Socket.IO 4, zod |
| App mobile | `mobile/` | Expo SDK 57, React Native, expo-router, TanStack Query, MapLibre |
| Telas de administração (RF17) | repositório **hub** (admin web) | consomem `/api/v1/admin/*` do OpenDriver |

## 2. Banco de dados compartilhado com o hub

O OpenDriver usa **o mesmo Postgres do OpenDriverHub**.

- **Tabelas do hub (schema `public`) são reaproveitadas, nunca alteradas**:
  `users` (identidade única — passageiro, motorista, admin), `auth_tokens`
  (verificação de e-mail / redefinição de senha), `integration_settings`
  (credenciais Asaas/e-mail editáveis no admin do hub), `cashback_entries`
  (extrato do saldo de cashback usado nas corridas).
- **Tabelas novas ficam no schema `opendriver`**. Motivos:
  1. As migrations do OpenDriver têm sua própria tabela `_prisma_migrations`
     (no schema `opendriver`), sem colidir com o histórico de migrations do hub.
  2. O `prisma migrate` do hub só enxerga `public` e não detecta "drift" por
     causa das tabelas do OpenDriver.
  3. Isolamento claro de responsabilidade e de permissões de banco.
- Toda migration do OpenDriver é **aditiva** e escrita à mão em
  `backend/prisma/migrations/*/migration.sql` (mesma convenção do hub para
  banco de produção). As FKs para `public.users` usam `ON DELETE RESTRICT`
  (o hub nunca apaga usuários; anonimiza).
- Papéis: o enum `public."UserRole"` do hub já tem `Passenger` e `Driver`
  (RF01). Qualquer usuário autenticado pode pedir corrida; só `Driver` com
  perfil aprovado pode dirigir (RF12).

## 3. Autenticação compartilhada (RF02, RF11, UX05)

- A API do OpenDriver emite **exatamente o mesmo formato de token do hub**:
  JWT HS256 (`iss`/`aud` = `opendriverhub`, claims `sub`, `name`, `email`,
  `role`, `partnerId`) + refresh token `base64(userId|expiresAt|hmacSHA256)`,
  com o **mesmo `JWT_SECRET`**. Um token emitido por um serviço é aceito pelo
  outro.
- Senhas: bcrypt custo 11 (idêntico ao hub). Tokens de uso único: SHA-256 em
  `public.auth_tokens` (os links de e-mail podem apontar para as páginas do hub
  `/verificar-email` e `/redefinir-senha`, que consomem a mesma tabela).
- **Hub em 1 toque (UX05):** a aba "Hub" abre o site do OpenDriverHub numa
  WebView injetando `odh.token`/`odh.refresh` no `localStorage` antes do
  carregamento — o usuário cai direto na área dele, sem novo login.

## 4. Corridas

### 4.1 Estados (UX07, UX14)

```
Searching ──► DriverAssigned ──► DriverArrived ──► InProgress ──► Completed
    │               │                  │
    └──► NoDrivers  └──► Cancelled ◄───┘  (Cancelled também a partir de Searching)
```

Cada transição é validada no servidor (tabela de transições permitidas por
papel) e registrada em `opendriver.ride_events`. O app só mostra as ações
válidas do estado atual.

### 4.2 Preço (RF07)

- Cotação no servidor: rota OSRM (distância/duração/polilinha) × tabela de
  preços por categoria (`opendriver.pricing`): `tarifa base + km + minuto`,
  com tarifa mínima. A cotação vira `ride_quotes` (válida por 5 min) e o
  **preço é travado** no pedido — o passageiro vê um valor e paga esse valor.
- Taxa da plataforma (%) por categoria → `driver_earning = tarifa − taxa`.

### 4.3 Matching (RF04, RF05)

- Motorista online envia posição a cada ~4 s (`driver_locations`).
- Ao pedir: candidatos = online, aprovados, com veículo aprovado da
  categoria, livres, posição com menos de 60 s, num raio configurável;
  ordenados por distância.
- Oferta sequencial: um motorista por vez, 15 s para aceitar
  (`ride_offers`). Recusa/timeout → próximo. Sem candidatos após N
  tentativas/raio máximo → `NoDrivers`.
- Aceite é atômico (`UPDATE ... WHERE status='Searching'`): nunca dois
  motoristas na mesma corrida.
- Os timeouts rodam em memória e um job de varredura (a cada 5 s) garante
  que ofertas vencidas avancem mesmo após reinício do processo.

### 4.4 Tempo real (RF06)

Socket.IO autenticado com o mesmo JWT. Salas `user:<id>` e `ride:<id>`.
Eventos: `ride:update`, `ride:offer`, `driver:location`. Localização do
motorista é transmitida ao passageiro **só** nos estados `DriverAssigned`,
`DriverArrived` e `InProgress`. Push (Expo) cobre o app em segundo plano.

## 5. Pagamento (RF08, UX04)

| Método | Fluxo | Interações do passageiro |
| --- | --- | --- |
| Cartão salvo (Asaas) | cartão tokenizado 1× (só o token é guardado, cifrado); cobrado automaticamente ao finalizar | 0 |
| Pix | cobrança Pix gerada ao finalizar; QR/copia-e-cola na tela; confirmação por webhook/consulta | 1 (pagar no banco) |
| Saldo de cashback do Hub | abatido atomicamente de `public.users.cashback_balance` (lançamento em `cashback_entries`), restante vai para o método padrão | 0 |

- O método padrão é usado automaticamente (UX04, UX09); opção única é
  selecionada sozinha.
- Credenciais Asaas vêm de `public.integration_settings` (as mesmas do hub).
  Cobranças do OpenDriver usam `externalReference = "ride:<id>"`; o webhook
  do OpenDriver ignora eventos que não são de corrida (e vice-versa no hub).
- Gateway `mock` para desenvolvimento/testes (`PAYMENT_PROVIDER=mock`).
- Falha na cobrança não trava a corrida: ela conclui com pagamento
  `Failed` e o app mostra "Não foi possível cobrar… [Corrigir pagamento]"
  (UX11).

## 6. Motorista (RF12, RF13, RF14)

- Onboarding: dados da CNH + fotos (CNH, selfie), veículo (placa, modelo,
  cor, ano, categoria, CRLV) → `InReview` → aprovação no admin (RF17).
- Chave Pix para recebimento; ganhos em livro-caixa
  (`driver_earnings`) e saques (`payout_requests`) pagos pelo financeiro.

## 7. Segurança (RF15, UX13) e gravação (RF16)

- Botão de segurança sempre visível durante a viagem: ligar 190,
  compartilhar a viagem (link público `/t/<token>` com posição ao vivo,
  expira ao fim da corrida), avisar contatos de confiança, registrar
  ocorrência.
- Gravação de áudio: **opt-in** com consentimento versionado; grava só
  durante `InProgress`; o arquivo é **cifrado no servidor (AES-256-GCM)**
  antes de ir ao storage (MinIO do hub, bucket próprio); só o suporte acessa,
  vinculado a uma ocorrência; **apagado automaticamente em 30 dias**.

## 8. Mapas e rotas (RF07) — OpenStreetMap

- Rotas: **OSRM** (`OSRM_URL`); endereços: **Nominatim** (`NOMINATIM_URL`).
  Os servidores públicos do OSM proíbem uso comercial pesado — em produção
  apontar para instâncias próprias (ou provedor gerenciado compatível).
- Mapa no app: **MapLibre** com estilo configurável (`EXPO_PUBLIC_MAP_STYLE_URL`,
  tiles próprios ou provedor compatível com OSM).
- Sem OSRM disponível, a API usa estimativa por distância em linha reta ×
  fator de sinuosidade (apenas fallback; sinalizado na cotação).

## 9. Administração (RF17)

Endpoints `/api/v1/admin/*` (papel `Admin` do hub): usuários, motoristas
(aprovar/reprovar/suspender), veículos, corridas, pagamentos, saques,
tabela de preços, métricas. As telas ficam no painel admin web do hub.
