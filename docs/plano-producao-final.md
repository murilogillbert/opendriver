# Plano final de produção — pendências antes do lançamento pleno

> Este documento é a especificação das **últimas pendências** do OpenDriver antes de operar em
> produção real (dinheiro de verdade e a funcionalidade de corrida "apenas mulheres"). Foi escrito
> para ser executado por outra IA (spec-driven) com acesso a este repositório e ao servidor de
> produção (Coolify). Cada seção tem requisitos, contexto de design e uma lista de tarefas —
> sigam na ordem em que aparecem, porque a §1/§2 destravam dinheiro real e a §3 é uma feature
> nova com migration própria.
>
> Checado em produção em 2026-10-02, direto no servidor (`ssh root@179.236.228.94`, containers
> `hub-backend`/`opendriver-backend`, Postgres compartilhado `hub` no container
> `l5bcr9slmgtmeefkqwg5amia`, schema `opendriver` + `public`): os dois backends estão rodando com
> `PAYMENT_PROVIDER=mock`, e a tabela `public.integration_settings` **não tem nenhuma chave do
> Asaas nem da Infosimples** — só `Email:*` e `Survey:*`. Ou seja, não é "corrigir uma credencial
> errada": é cadastrar as credenciais pela primeira vez.
>
> Regras de segurança que já valiam nesta sessão e continuam valendo:
> - Nunca rodar `prisma migrate dev` ou `prisma db push` contra o banco de produção — só
>   `prisma migrate deploy`, depois do protocolo de backup abaixo.
> - Nunca alterar nem remover dado/tabela do schema `public` (é do hub).
> - Antes de qualquer migration: 1) backup completo do banco; 2) `pg_dump --schema-only
>   --schema=public` antes; 3) aplicar `backend/prisma/bootstrap/001_migrations_table.sql`
>   (idempotente); 4) `prisma migrate deploy`; 5) `pg_dump --schema-only --schema=public` depois e
>   comparar com o de antes — se mudou qualquer coisa **além** do token aleatório `\restrict`/
>   `\unrestrict` que o próprio `pg_dump` varia a cada execução, **parar e avisar**, nunca seguir.
> - Nunca commitar segredo (token, senha, chave de API) no git — nem em `.env`, nem em código, nem
>   neste repositório. Credenciais do Asaas/Infosimples vão só no banco (`integration_settings`,
>   via Admin → Integrações), nunca em arquivo.

---

## 1. Ativar pagamento real (Asaas) — hub **e** opendriver

### Requisitos

- RF: cobrança real de cartão/Pix nas duas plataformas (hoje: `PAYMENT_PROVIDER=mock` nos dois,
  confirmado em produção).
- As duas aplicações usam a **mesma** conta/credenciais Asaas — é assim de propósito
  (`backend/src/infra/payments/asaas.ts`, comentário: "mesma conta/credenciais do hub, em
  `public.integration_settings`"). Não é pra criar uma segunda conta Asaas só pro OpenDriver.

### Design / onde cada coisa mora

| O quê | Onde | Observação |
|---|---|---|
| Chave da API Asaas | `public.integration_settings`, chave `Asaas:ApiKey` | Lida por `getSetting()` nos dois backends, sem redeploy pra trocar depois. |
| Ambiente (sandbox/produção) | `public.integration_settings`, chave `Asaas:Environment` | Valor `production` (qualquer outra coisa cai em sandbox — `asaas.ts:17`). |
| Token do webhook (hub) | `public.integration_settings`, chave `Asaas:WebhookToken` | Já deve existir se o hub já processa pagamento via Asaas em algum momento — confirmar. |
| Token do webhook (opendriver) | `public.integration_settings`, chave `OpenDriver:AsaasWebhookToken` | Opcional: se não existir, o opendriver cai no `Asaas:WebhookToken` do hub (`payments.routes.ts:49`). Mais simples: reusar o mesmo token, cadastrando o webhook do opendriver com o token do hub. |
| Seleção do provedor (opendriver) | env `PAYMENT_PROVIDER` no Coolify, app `opendriver-backend` | `mock` \| `asaas` (`backend/src/config.ts:52`). Lido só no boot — **exige redeploy**. |
| Seleção do provedor (hub) | env `PAYMENT_PROVIDER` no Coolify, app `hub-backend` | Mesmo princípio, ver `hub/backend/CLAUDE.md` (`infra/paymentGateways/`, `index.ts`). |
| Segunda assinatura de webhook | Painel do Asaas (ou API) | Precisa de **dois** webhooks cadastrados: um pra `https://hubapi.opendriver.com.br/...` (se ainda não existir) e um novo pra `https://api-app.opendriver.com.br/api/v1/payments/webhook/asaas`. |

Admin → Integrações (painel do hub) é a tela que escreve em `integration_settings` — confirmar que
ela já tem um campo genérico de chave/valor ou que aceita `Asaas:ApiKey`/`Asaas:Environment`/
`Asaas:WebhookToken`/`OpenDriver:AsaasWebhookToken` como chaves novas. Se a tela só tiver campos
fixos pra Email/Survey, é preciso estender essa tela antes (pequeno, só mais um bloco de campos).

### Tarefas

1. [ ] No painel do Asaas (conta real, não sandbox — confirmar qual ambiente o usuário quer usar
       primeiro), gerar a chave de API e confirmar o token de webhook desejado.
2. [ ] Em Admin → Integrações no hub, cadastrar `Asaas:ApiKey` e `Asaas:Environment=production`
       (ou `sandbox`, pra testar primeiro — recomendado testar em sandbox antes de ir pra
       produção real). Se a tela não suportar chaves novas, estender o formulário.
3. [ ] Cadastrar `Asaas:WebhookToken` (se ainda não existir) e, opcionalmente,
       `OpenDriver:AsaasWebhookToken` (pode ser o mesmo valor).
4. [ ] No painel do Asaas, registrar o segundo webhook apontando pra
       `https://api-app.opendriver.com.br/api/v1/payments/webhook/asaas`, com o token escolhido
       no passo 3.
5. [ ] Protocolo de backup (ver regras no topo) — mesmo não sendo uma migration, fazer um
       `pg_dump` completo antes de mexer em variável de ambiente de produção é uma rede de
       segurança barata.
6. [ ] No Coolify, trocar `PAYMENT_PROVIDER=mock` → `PAYMENT_PROVIDER=asaas` na aplicação
       `hub-backend` e redeployar.
7. [ ] No Coolify, trocar `PAYMENT_PROVIDER=mock` → `PAYMENT_PROVIDER=asaas` na aplicação
       `opendriver-backend` e redeployar.
8. [ ] Teste real: uma corrida de ponta a ponta no app (ou um pagamento de teste no hub) com
       valor baixo, confirmando que a cobrança aparece no painel do Asaas e que o webhook chega
       (status muda de `Pending` pra `Paid` sem precisar de reconciliação manual).
9. [ ] Confirmar que `assertProductionConfig()` (`backend/src/config.ts:107`) não lança erro no
       boot do opendriver — ele já rejeita `PAYMENT_PROVIDER=mock` em produção, então se o boot
       falhar depois da troca, é sinal de outra variável de produção faltando (ver a função toda
       pra checklist completo: `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `PUBLIC_BASE_URL` https).

---

## 2. Ativar validação automática de CRLV (Infosimples) — opendriver

### Requisitos

- Plano §4 (`docs/plano-implementacao.md`): motorista informa placa + RENAVAM (+ UF), o backend
  consulta a Infosimples e aprova automaticamente quando não há restrição — hoje cai sempre em
  revisão manual porque `VEHICLE_VALIDATION_PROVIDER` não está setado (default `mock`) e não há
  token da Infosimples cadastrado.
- Cobertura real hoje: só **MT** e **MS** (`backend/src/infra/vehicleValidation/infosimples.ts`,
  `STATE_ENDPOINT`) — é a área de operação atual (Centro-Oeste). DF e GO exigiriam login GOV.BR,
  fora de escopo.
- **Atenção**: o código nunca foi testado contra uma placa real (só contra o formato de resposta
  da documentação). A primeira chamada em produção é o teste de verdade — fazer com um veículo
  real do motorista, acompanhando o resultado em `opendriver.vehicle_validations` antes de confiar
  cegamente na aprovação automática.

### Design

| O quê | Onde |
|---|---|
| Token da Infosimples | `public.integration_settings`, chave `Infosimples:Token` (lido em `infosimples.ts:51`) |
| Seleção do provedor | env `VEHICLE_VALIDATION_PROVIDER` no Coolify, app `opendriver-backend` — `mock` \| `infosimples` (`backend/src/config.ts`, bloco `vehicleValidation`). Também lido só no boot. |

### Tarefas

1. [ ] Confirmar com o usuário que a conta/plano da Infosimples cobre os serviços
       `detran/mt/veiculo` e `detran/ms/veiculo` (API Detran Unificada) e que ainda há cota no
       plano gratuito ou que o plano pago já foi contratado.
2. [ ] Cadastrar `Infosimples:Token` em Admin → Integrações.
3. [ ] No Coolify, setar `VEHICLE_VALIDATION_PROVIDER=infosimples` na aplicação
       `opendriver-backend` e redeployar.
4. [ ] Teste real: cadastrar um veículo de motorista de teste com placa + RENAVAM reais de MT ou
       MS, confirmar em `opendriver.vehicle_validations` (coluna `result`/`matched`/`detail_json`)
       que a resposta bateu com o esperado antes de liberar isso pra motoristas de verdade.
5. [ ] Se a cobertura precisar crescer pra outros estados no futuro, é um novo item no
       `STATE_ENDPOINT` de `infosimples.ts` — fora do escopo deste documento.

---

## 3. Corrida "apenas mulheres" (plano §7)

### Requisitos (RF-novo, UX13, segurança)

Passageira mulher pode pedir corrida atendida somente por motorista mulher; motorista mulher pode
optar por só receber ofertas de passageiras. Nota de produto/jurídica (já no plano original,
continua valendo): definir com o usuário a política de verificação de gênero e a comunicação,
alinhada à LGPD e às diretrizes das lojas (App Store/Play) **antes** de liberar pra usuários reais
— isso não é uma decisão técnica, é uma decisão de produto que precisa ser confirmada com o
usuário antes do passo 1 abaixo.

### Design — siga o mesmo padrão já usado no modo acessibilidade (plano §11.7)

O modo acessibilidade (veículo adaptado) implementado nesta sessão é **estruturalmente idêntico**
ao que "apenas mulheres" precisa — mesma forma (preferência salva + flag por corrida + filtro no
despacho). Use esses arquivos como modelo direto, trocando "cadeira de rodas" por "gênero":

- `backend/prisma/schema.prisma` — `PassengerProfile.wheelchairAccessible`,
  `Vehicle.wheelchairAccessible`, `Ride.accessibilityRequired`.
- `backend/prisma/migrations/20261002160000_accessibility_mode/migration.sql` — formato da
  migration aditiva.
- `backend/src/modules/rides/dispatch.ts` — função `candidates()`, filtro de veículo por
  `wheelchairAccessible: true` quando a corrida exige.
- `backend/src/modules/me/me.routes.ts` — `PUT /me/accessibility`.
- `backend/src/modules/rides/rides.service.ts` — `requestSchema.accessibilityRequired`,
  resolução do padrão a partir do perfil salvo.
- `mobile/src/screens/AccountScreen.tsx` — `SwitchRow` de preferência salva.
- `mobile/src/features/passenger/QuotePanel.tsx` — `SwitchRow` de override por corrida.
- `mobile/src/features/driver/DriverRidePanel.tsx` — badge informativo pro motorista.

#### Diferenças específicas de "apenas mulheres" em relação ao acessível

1. **Gênero é dado sensível** (diferente de "tenho cadeira de rodas no carro"). Guardar em
   `opendriver.passenger_profiles.gender` / `opendriver.driver_profiles.gender`
   (`VARCHAR(12)`, nullable, valores sugeridos: `'female' | 'male' | 'other' | null` — null =
   "preferiu não informar"), coleta **opt-in explícita** (tela própria explicando a finalidade:
   segurança, usado só pra decidir elegibilidade, nunca mostrado a terceiros). Nunca inferir
   gênero a partir do nome.
2. Dois lados da preferência, não um:
   - Passageira: `passenger_profiles.womenOnlyPref` (quer só motorista mulher).
   - Motorista: `driver_profiles.womenOnlyPref` (só aceita passageiras mulheres).
   Os dois são opcionais e independentes — o acessível só tinha um lado (passageira pede,
   motorista declara capacidade do carro; aqui os dois lados têm uma preferência ativa).
3. `Ride.womenOnly BOOLEAN NOT NULL DEFAULT false` — trava a regra na corrida (mesmo papel que
   `accessibilityRequired`), mas **só pode ser `true` se `passenger_profiles.gender = 'female'`**
   no momento do pedido (valide no service, não só no mobile — UX11: nunca confiar só no cliente).
4. `dispatch.ts`'s `candidates()`: quando `ride.womenOnly`, o filtro de elegibilidade não é no
   veículo (como o acessível) — é no **motorista**: `driverProfile.gender = 'female'`. E, na
   direção contrária, um motorista com `womenOnlyPref = true` só deve aparecer nos candidatos de
   corridas onde `passengerGender === 'female'` (ou seja, o filtro de exclusão funciona nos dois
   sentidos — adicionar essa segunda condição independente da primeira).
5. Mobile: o alternador "Apenas mulheres" no `QuotePanel` só aparece se
   `me.passenger?.gender === 'female'` (nunca mostrar a opção pra quem não se identificou assim).
   Preferência da motorista mulher: tela de perfil do motorista (`driver/*`), visível só se
   `me.driver` existir e o gênero cadastrado for `'female'`.
6. Mensagem de erro quando não há motorista compatível: igual ao padrão UX11 (diz o que
   aconteceu, nunca "nenhum resultado" seco) — reaproveitar a tela `NoDrivers` já existente, só
   ajustando o texto quando `ride.womenOnly` pra explicar que a busca foi restrita.

### Tarefas

1. [x] **Confirmar com o usuário** a política de coleta/uso de gênero (texto de consentimento,
       onde a opção de "apenas mulheres" aparece, se motoristas homens veem alguma indicação de
       que perderam a corrida por isso — recomendação: não, só "motorista não disponível").
       Confirmado em 2026-10-02: opções `Mulher | Homem | Outro | Prefiro não informar`, finalidade
       escrita na própria tela (`GENDER_PURPOSE` em `mobile/src/components/GenderPicker.tsx`), e
       motorista homem não recebe nenhuma indicação — simplesmente não recebe a oferta.
2. [x] Migration nova `backend/prisma/migrations/20261002190000_women_only_rides/migration.sql`,
       aditiva:
       - `opendriver.passenger_profiles`: `ADD COLUMN gender VARCHAR(12)`,
         `ADD COLUMN women_only_pref BOOLEAN NOT NULL DEFAULT false`.
       - `opendriver.driver_profiles`: `ADD COLUMN gender VARCHAR(12)`,
         `ADD COLUMN women_only_pref BOOLEAN NOT NULL DEFAULT false`.
       - `opendriver.rides`: `ADD COLUMN women_only BOOLEAN NOT NULL DEFAULT false`.
       - Espelhar essas três mudanças em `prisma/schema.prisma` antes de gerar a migration à mão
         (mesmo processo das migrations desta sessão — nunca `prisma migrate dev` contra produção).
3. [x] Backend: endpoint pra coletar gênero (opt-in) — passageiro e motorista. Ficaram rotas
       dedicadas (e não um campo em `PUT /me/profile`, que escreve em `public.users`, do hub):
       `PUT /me/gender` + `PUT /me/women-only` (`me.routes.ts`) e `PUT /driver/preferences`
       (`driver.routes.ts` → `driver.service.ts:setPreferences`). `GET /me` devolve o que a pessoa
       declarou, pra ela poder trocar ou apagar; `deleteAccount` limpa o gênero dos dois perfis.
4. [x] Backend: `requestSchema` em `rides.service.ts` ganha `womenOnly` opcional; validar que só
       passa a `true` se `passenger_profiles.gender === 'female'` — e recusar junto com
       `guestPassengerName` (`women_only_guest_ride`), que o schema já apontava como incompatível.
5. [x] Backend: `dispatch.ts`'s `candidates()` — filtro por gênero nos dois sentidos (item 4 do
       Design acima), via `driverMatchesRideGender()`.
6. [x] Backend: `rideDto.ts` expõe `womenOnly` na corrida (mesmo padrão de
       `accessibilityRequired`).
7. [x] Mobile: telas de coleta de gênero (opt-in, com texto claro de finalidade) em conta
       (`app/account/gender.tsx`) e no perfil de motorista (`app/driver/preferences.tsx`), as duas
       usando o mesmo `GenderPicker`/`GENDER_PURPOSE` pra não haver duas promessas diferentes.
8. [x] Mobile: alternador "Apenas mulheres" no `QuotePanel` (condicional ao gênero e escondido em
       corrida pedida pra outra pessoa) e preferência equivalente na tela da motorista. Badge no
       `DriverRidePanel` e texto próprio de `NoDrivers` no `RidePanel`.
9. [x] Testes: regra isolada em `backend/src/domain/genderPolicy.ts` e coberta em
       `tests/unit/domain.test.ts`, sem precisar de banco (backend 28 testes, mobile 32, typecheck
       e lint limpos).
10. [ ] Rodar o mesmo protocolo de migration do topo deste documento antes de aplicar em
        produção. **Pendente** — a migration está escrita e versionada, mas não foi aplicada em
        nenhum banco: fazer backup, `pg_dump --schema-only --schema=public` antes, aplicar
        `bootstrap/001_migrations_table.sql`, `prisma migrate deploy`, e comparar o dump depois.

---

## 4. Corrida para terceiros — implementado em 2026-10-02

> Esta seção documenta uma funcionalidade que **não existia em nenhum documento** de `docs/` antes
> desta sessão. O que havia no código era só `rides.guest_passenger_name` (nome em texto livre,
> pedido por heurística de distância do embarque), sem CPF, sem nascimento e sem vínculo entre
> contas.

### Regra

Quem pede e paga a corrida não é necessariamente quem embarca. Três casos, com rigor diferente:

| Caso | Como entra | "Apenas mulheres" (§3) |
|---|---|---|
| `self` | o padrão — quem pede embarca | permitido se a própria pessoa declarou `female` |
| `linked` | outra conta da plataforma, por **convite + aceite** (`opendriver.passenger_links`) | permitido **se a passageira autorizou no aceite** (`women_only_allowed`) |
| `guest` | dependente sem perfil, cadastrado por quem pede (`opendriver.guest_passengers`): nome completo, CPF e nascimento obrigatórios, telefone opcional | **nunca** — só existe um nome informado por terceiro |

Menor de idade (`< 18`, por `birth_date`) só viaja com a confirmação explícita de que um adulto
responsável embarca junto; a confirmação fica gravada em `rides.minor_accompanied` e é mostrada ao
motorista.

### Duas decisões de design que não estavam no enunciado

1. **`passenger_links.women_only_allowed` é da convidada, não de quem convida.** A regra pede que a
   exclusividade feminina continue valendo para passageira cadastrada, mas a §3 proíbe expor o
   gênero de alguém a terceiros — e o app de quem pede precisaria saber se a opção se aplica. A
   única forma de habilitar sem vazar nada é a própria pessoa autorizar essa divulgação no aceite
   do vínculo. Sem autorização, o pedido é recusado com `women_only_not_authorized`.
2. **CPF de terceiro fica cifrado.** `guest_passengers.cpf_enc` usa o mesmo AES-256-GCM do token de
   cartão, e `cpf_hash` é um HMAC determinístico que existe só para a chave única `(owner, CPF)` —
   evita cadastro duplicado sem guardar o número em claro. As duas colunas são anuláveis para que a
   exclusão da conta do dono apague o CPF sem destruir a linha que o histórico referencia.

### Onde mora

- Domínio: `backend/src/domain/ridePassenger.ts` (tipos de passageiro, `requiresAdultEscort`).
- Módulo: `backend/src/modules/passengers/` — `/me/guest-passengers` (CRUD) e `/me/passenger-links`
  (convite, aceite, recusa, desfazer). O convite responde sempre igual, exista ou não a conta, pra
  não virar um verificador de e-mails (mesma postura do `forgotPassword`); o limite por usuário é
  `limits.passengerInvite`.
- Pedido: `requestSchema.passengerFor` em `rides.service.ts` (união discriminada) e
  `resolveRequestedPassenger()`.
- Despacho: `dispatch.ts` usa o gênero de **quem embarca** (desconhecido em `guest`, nunca herdado
  de quem pediu), exclui quem embarca dos candidatos e respeita os bloqueios dos dois lados.
- Mobile: `app/passengers/*`, `components/ride/PassengerPicker.tsx`, e o seletor "Quem vai
  embarcar?" no `QuotePanel` (a heurística de distância virou só um lembrete).

### Pendências desta seção

1. [ ] Aplicar a migration `20261002200000_ride_for_other_passenger` em produção pelo protocolo do
       topo deste documento. Ela foi validada contra um Postgres 16 descartável (as 14 migrations
       aplicam limpas e `prisma migrate diff` não acusa divergência no schema `opendriver`), mas
       **não foi aplicada em nenhum banco real**.
2. [ ] Decidir se o passageiro `linked` passa a acompanhar a corrida no app dele (PIN de embarque,
       rastreamento, botão de emergência). Hoje não: quem pede segue com o PIN e o acompanhamento,
       e a FK `rides.passenger_for_id` já está gravada pra habilitar isso depois sem migration nova.
       Mexe em `loadForUser`, `rideInclude`, `publishRide`, `activeRide`, safety, mensagens e
       gravações — todos assumem dois participantes hoje.
3. [ ] Decidir se o caminho legado `guestPassengerName` (nome em texto livre, sem CPF/nascimento)
       deve ser recusado. Ele continua aceito para não quebrar versões do app já publicadas, e já
       está fora da política de "apenas mulheres" — mas é um desvio da coleta obrigatória de dados
       para quem chamar a API direto. Fechar é uma linha em `rides.service.ts`.
4. [ ] Confirmar com o jurídico a política de transporte de menor acompanhado (o app exige a
       confirmação, mas a responsabilidade pelo embarque é de quem pede).

---

## 5. Fora de escopo deste documento (decisão de produto, não técnica)

- **Ligação com número mascarado** (parte do plano §11.1 — chat mascarado). As mensagens rápidas
  já estão prontas e em produção; só a ligação por número mascarado falta, e depende de contratar
  um provedor de telefonia/SMS (ex.: Twilio) com número(s) próprio(s) — custo recorrente, decisão
  do usuário, não algo pra especificar/implementar sem essa escolha feita primeiro.

---

## Ordem recomendada de execução

1. §1 (pagamento real) — maior impacto, destrava receita de verdade nas duas plataformas.
2. §2 (CRLV automático) — independente de §1, pode ser feito em paralelo.
3. §3 (apenas mulheres) — feature nova, só depois de confirmar a política de produto (tarefa 1 da
   seção) com o usuário. **Código concluído**; falta aplicar a migration em produção.
4. §4 (corrida para terceiros) — **código concluído**; falta aplicar a migration em produção e
   fechar as quatro pendências da seção.
