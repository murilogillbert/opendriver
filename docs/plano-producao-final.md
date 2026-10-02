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

1. [ ] **Confirmar com o usuário** a política de coleta/uso de gênero (texto de consentimento,
       onde a opção de "apenas mulheres" aparece, se motoristas homens veem alguma indicação de
       que perderam a corrida por isso — recomendação: não, só "motorista não disponível").
2. [ ] Migration nova `backend/prisma/migrations/<timestamp>_women_only_rides/migration.sql`
       (próximo timestamp depois de `20261002180000_ride_messages`), aditiva:
       - `opendriver.passenger_profiles`: `ADD COLUMN gender VARCHAR(12)`,
         `ADD COLUMN women_only_pref BOOLEAN NOT NULL DEFAULT false`.
       - `opendriver.driver_profiles`: `ADD COLUMN gender VARCHAR(12)`,
         `ADD COLUMN women_only_pref BOOLEAN NOT NULL DEFAULT false`.
       - `opendriver.rides`: `ADD COLUMN women_only BOOLEAN NOT NULL DEFAULT false`.
       - Espelhar essas três mudanças em `prisma/schema.prisma` antes de gerar a migration à mão
         (mesmo processo das migrations desta sessão — nunca `prisma migrate dev` contra produção).
3. [ ] Backend: endpoint pra coletar gênero (opt-in) — passageiro e motorista. Pode ser um campo
       novo em telas que já existem (`PUT /me/profile` ganha `gender` opcional) ou uma rota
       dedicada, à escolha de quem implementar — mas sempre opt-in, nunca obrigatório pra usar o
       app.
4. [ ] Backend: `requestSchema` em `rides.service.ts` ganha `womenOnly` opcional; validar que só
       passa a `true` se `passenger_profiles.gender === 'female'`.
5. [ ] Backend: `dispatch.ts`'s `candidates()` — filtro por gênero nos dois sentidos (item 4 do
       Design acima).
6. [ ] Backend: `rideDto.ts` expõe `womenOnly` na corrida (mesmo padrão de
       `accessibilityRequired`).
7. [ ] Mobile: telas de coleta de gênero (opt-in, com texto claro de finalidade) em conta
       (passageira) e no cadastro/perfil de motorista.
8. [ ] Mobile: alternador "Apenas mulheres" no `QuotePanel` (condicional ao gênero) e preferência
       equivalente na tela de perfil da motorista.
9. [ ] Testes: espelhar os testes de domínio já existentes (`tests/unit/domain.test.ts`) pra
       qualquer função pura nova (ex.: se a elegibilidade por gênero virar uma função isolada tipo
       `domain/driverQuality.ts`/`domain/mockLocation.ts`, testá-la sem precisar de banco).
10. [ ] Rodar o mesmo protocolo de migration do topo deste documento antes de aplicar em
        produção.

---

## 4. Fora de escopo deste documento (decisão de produto, não técnica)

- **Ligação com número mascarado** (parte do plano §11.1 — chat mascarado). As mensagens rápidas
  já estão prontas e em produção; só a ligação por número mascarado falta, e depende de contratar
  um provedor de telefonia/SMS (ex.: Twilio) com número(s) próprio(s) — custo recorrente, decisão
  do usuário, não algo pra especificar/implementar sem essa escolha feita primeiro.

---

## Ordem recomendada de execução

1. §1 (pagamento real) — maior impacto, destrava receita de verdade nas duas plataformas.
2. §2 (CRLV automático) — independente de §1, pode ser feito em paralelo.
3. §3 (apenas mulheres) — feature nova, só depois de confirmar a política de produto (tarefa 1 da
   seção) com o usuário.
