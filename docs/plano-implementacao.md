# Plano de Implementação — Novos Recursos OpenDriver

Documento de planejamento técnico para as frentes solicitadas:

1. Cancelamento com motivo + regra dos 3 minutos (debuff monetário / repasse)
2. Rankeamento 1–5 estrelas com precisão de meia estrela
3. Central de reclamações (passageiro e motorista) com anexo de foto
4. Validação automática de CRLV via **Infosimples**
5. Corridas agendadas (busca geral ou motorista favorito) + regras de penalidade
6. Motoristas favoritos e lista de favoritos
7. Corrida "apenas mulheres" (passageira e motorista)
8. Código/PIN de embarque com regra de 5 minutos (corrida normal e agendada)
9. Pin no mapa para embarque/destino quando o endereço não é encontrado
10. Decisão de geocoding: Nominatim (atual) vs Google Maps (pago)
11. Demais sugestões de melhoria

Cada frente referencia os RF/UX de [requisitos.md](requisitos.md) e segue as regras de
[arquitetura.md](arquitetura.md): migrations **aditivas e manuais** no schema `opendriver`,
o schema `public` (hub) **nunca é alterado**, e a máquina de estados/ações continua sendo a
fonte única do que o app mostra (`domain/rideState.ts`).

> Convenção de valores: todo dinheiro em `Decimal(10,2)` via `decimal.js` (`lib/money.ts`),
> nunca `number` de ponto flutuante em cálculo.

---

## 1. Cancelamento com motivo, debuff e repasse (RF-novo, UX07, UX11, UX14)

### 1.1 Regras de negócio — corrida normal

Marco de referência: **`acceptedAt`** (quando o motorista aceitou). Janela de tolerância
configurável, **padrão 3 minutos** (`CANCEL_GRACE_SECONDS=180`).

| Quem cancela | Antes de 3 min do aceite | Depois de 3 min do aceite |
| --- | --- | --- |
| **Passageiro** | Sem cobrança (`NotRequired`) | Cobra o **valor total da corrida**. Motorista recebe `total − taxa da plataforma`; plataforma fica com a taxa (padrão **R$ 2,00**). |
| **Motorista** | Volta a `Searching` (novo matching), sem penalidade | **Debuff monetário** aplicado ao motorista; a corrida volta a `Searching` para outro motorista. |

Pontos firmados:

- O debuff do motorista é **apenas monetário** — **não** mexe no rankeamento de ninguém.
- A taxa fixa de repasse à plataforma no cancelamento (R$ 2,00) é **configurável por categoria**
  (`Pricing.cancellationPlatformFee`), separada da `platformFeePercent` da corrida normal.
- "Valor total" = `ride.fare` travado no pedido (o mesmo que o passageiro veria ao concluir).
- Sempre há **motivo**: lista de opções padrão + campo livre opcional (estilo Uber).

> A regra de cancelamento das **corridas agendadas** é diferente (janela também depende de faltar
> ≤ 10 min para o início). Ver §5.3.

### 1.2 Motivos padrão (enum de produto, não do banco)

Definir em `backend/src/domain/cancelReasons.ts` (fonte única, exposta via endpoint para o app):

```ts
// Motivos por papel; o app renderiza a lista que a API devolver (UX07/UX12).
export const PASSENGER_CANCEL_REASONS = [
  { code: 'driver_too_far',      label: 'Motorista está muito longe' },
  { code: 'driver_not_moving',   label: 'Motorista não sai do lugar' },
  { code: 'wrong_pickup',        label: 'Local de embarque errado' },
  { code: 'changed_plans',       label: 'Mudei de ideia' },
  { code: 'found_another_ride',  label: 'Consegui outra condução' },
  { code: 'wait_too_long',       label: 'Espera muito longa' },
  { code: 'other',               label: 'Outro motivo' },
] as const;

export const DRIVER_CANCEL_REASONS = [
  { code: 'passenger_no_show',   label: 'Passageiro não apareceu' },
  { code: 'cannot_reach',        label: 'Não consegui contato com o passageiro' },
  { code: 'wrong_address',       label: 'Endereço de embarque incorreto' },
  { code: 'too_many_passengers', label: 'Passageiros ou bagagem além do combinado' },
  { code: 'vehicle_issue',       label: 'Problema com o veículo' },
  { code: 'safety_concern',      label: 'Questão de segurança' },
  { code: 'other',               label: 'Outro motivo' },
] as const;
```

### 1.3 Mudanças de banco (migration aditiva)

`backend/prisma/migrations/<ts>_cancellation_policy/migration.sql`:

- `opendriver.pricing`:
  - `ADD COLUMN cancellation_platform_fee Decimal(10,2) NOT NULL DEFAULT 2.00` — taxa fixa da plataforma no cancelamento tardio.
  - `ADD COLUMN driver_cancel_penalty Decimal(10,2) NOT NULL DEFAULT 0` — debuff do motorista (0 = desligado até o negócio definir o valor).
- `opendriver.rides`:
  - `ADD COLUMN cancel_reason_code VARCHAR(40)` — motivo padronizado (o `cancelReason` livre continua para o texto).
- `opendriver."EarningType"` (enum): `ADD VALUE 'CancellationPenalty'` (lançamento negativo no livro-caixa).

Atualizar `schema.prisma` (modelos `Pricing`, `Ride`, enum `EarningType`) para espelhar a migration.

### 1.4 Backend — `rides.service.ts` (`cancelRide`)

Reescrever a lógica mantendo o `withLock`. **Passageiro cancela:**
```
grace  = config.cancel.graceSeconds (default 180)
tardio = status === 'DriverArrived'
      || (status === 'DriverAssigned' && acceptedAt && agora - acceptedAt > grace*1000)
se tardio e há motorista:
  fare        = ride.fare
  platformFee = pricing.cancellationPlatformFee            // ex.: 2,00
  repasse     = round2(max(0, fare - platformFee))          // se fare < fee → repasse 0 e fee = fare
  → DriverEarning { type: 'CancellationFee', amount: repasse }
  → ride.cancellationFee = fare; paymentStatus = 'Pending'; settleRide(rideId)   // cobra pelo meio padrão
senão:
  paymentStatus = 'NotRequired'
```
**Motorista cancela:** sempre volta a `Searching` + novo dispatch. Se tardio e `pricing.driverCancelPenalty > 0`
→ `DriverEarning { type: 'CancellationPenalty', amount: -penalty }` + `RideEvent 'driver_cancel_penalty'`.
Nunca altera `ratingSum`/`ratingCount`.

Registrar `cancelReasonCode` + `cancelReason` (texto) e gravar em `ride_events.payload`.

### 1.5 Backend — validação e rotas

- `cancelSchema` passa a exigir `reasonCode` (enum válido por papel) e `reason` opcional (máx. 200).
- Novo `GET /api/v1/rides/cancel-reasons?role=passenger|driver` devolve a lista de 1.2 (o app nunca hard-coda — UX12).

### 1.6 Mobile

- Ao tocar em **Cancelar**, bottom sheet com os motivos (`api.rides.cancelReasons(role)`), campo "Conte o que houve" quando `other`.
- Antes do cancelamento **tardio do passageiro**: "Como o motorista já estava a caminho, será cobrada a corrida (R$ X). Cancelar mesmo assim?" (UX11).
- Motorista tardio: "Cancelar agora aplica um desconto de R$ Y nos seus ganhos" (UX11).
- Telas: `passenger/index.tsx`, `drive/index.tsx`.

---

## 2. Rankeamento 1–5 com meia estrela (RF10)

Armazenar em **meios-passos inteiros** (1..10 = 0,5..5,0), reaproveitando `ratingSum/ratingCount`.

- `RideRating.stars` continua `Int`, mas passa a valer 1..10. Média = `round(sum/count/2, 1)` (ex.: 4,5).
- Migration `<ts>_half_star_ratings/migration.sql` (**idempotente**, roda uma vez só):
  - `UPDATE opendriver.ride_ratings SET stars = stars * 2;`
  - `UPDATE opendriver.driver_profiles SET rating_sum = rating_sum * 2;`
  - `UPDATE opendriver.passenger_profiles SET rating_sum = rating_sum * 2;`
  - `CHECK (stars BETWEEN 1 AND 10)`.
- Backend: `ratingSchema` aceita `stars` 0,5..5,0 em passos de 0,5 (valida `stars*2 ∈ 1..10`) e converte para meios-passos; DTOs (`toUserDto`, `getProfile`, `me`) dividem por 2. Janela de 7 dias e `@@unique([rideId, raterId])` permanecem.
- Mobile: `RatingInput` com meia estrela (toque na metade da estrela); exibição de médias com meia estrela.

---

## 3. Central de reclamações com foto (UX11, UX13)

Ampliar `SafetyIncident` (hoje `Emergency`/`Report`) para uma central de reclamação com anexos.

- Migration `<ts>_incident_attachments/migration.sql`:
  - `opendriver."IncidentType"`: `ADD VALUE 'Complaint'`.
  - `opendriver.safety_incidents`: `ADD COLUMN category VARCHAR(40)`, `ADD COLUMN role VARCHAR(12)`.
  - Nova tabela `opendriver.incident_attachments` (`id`, `incident_id` FK, `storage_key`, `mime_type`, `size_bytes`, `created_at`, índice por `incident_id`).
- Backend (`safety`/novo `complaints`): `openComplaint(userId, { rideId?, category, description, role })`; endpoint `POST /api/v1/incidents/:id/attachments` (multipart), só `image/*`, máx. 5 imagens de até 8 MB, **cifradas** com `putEncrypted`; leitura só por admin; alerta à equipe via `alertStaff`; job de retenção (ex.: 180 dias, configurável).
- Mobile: rota `app/safety/complaint.tsx` (categoria padrão, descrição, anexar fotos via `ImagePickerField`/`Media.tsx`), fila offline como `recordingQueue.ts`, acompanhamento de status.
- Admin: `/api/v1/admin/incidents` com filtros, fotos decifradas sob demanda, resolução + `audit_logs`.

Categorias padrão sugeridas: `driver_behavior`, `vehicle_condition`, `route_issue`, `payment_issue`, `lost_item`, `other`.

---

## 4. Validação automática de CRLV via Infosimples (RF13)

Decisão fechada: **usar somente a Infosimples**. É barata, tem cota inicial gratuita para testes
(~500 consultas) e cobre os estados via a **API Detran / Restrições (Unificada)**
([infosimples.com/consultas/detran-restricoes](https://infosimples.com/consultas/detran-restricoes/)),
que consulta por **UF + Placa + RENAVAM + Chassi** (para a UF `TO` também exige CPF/CNPJ do proprietário).
*Conteúdo rephrase para compliance de licenciamento.*

### 4.1 Estratégia

Serviço de validação com **provedor plugável** (mesmo padrão de `infra/payments`, que já tem `mock`/`asaas`):

1. Motorista informa **placa + RENAVAM** (e UF/chassi quando exigido) no cadastro do veículo.
2. Backend valida formato local (placa via `normalizePlate`; RENAVAM 11 dígitos com DV).
3. Chama a Infosimples (Detran Unificada) por UF+placa+RENAVAM+chassi.
4. Confere se os dados retornados batem com o cadastro e se **não há restrição impeditiva**:
   - Bate e sem restrição impeditiva → aprova automaticamente (`validation_status = 'Auto'`, `vehicle.status = 'Approved'`).
   - Divergência, restrição ou consulta indisponível → cai em **revisão manual** (fluxo atual do admin, RF17).
5. Cada tentativa é auditada em `vehicle_validations`.

> Credenciais (token Infosimples) ficam em `public.integration_settings` (lido, nunca escrito por
> este serviço) — mesma convenção de Asaas/e-mail. Gastar do free tier só em validações reais;
> em dev/testes usar provedor `mock`.

### 4.2 Mudanças de banco

`<ts>_crlv_validation/migration.sql`:
- `opendriver.vehicles`: `ADD COLUMN renavam VARCHAR(11)`, `ADD COLUMN chassi VARCHAR(30)`, `ADD COLUMN uf VARCHAR(2)`, `ADD COLUMN validation_status VARCHAR(20) NOT NULL DEFAULT 'Pending'` (`Pending`/`Auto`/`Manual`/`Rejected`).
- Nova tabela `opendriver.vehicle_validations`:
  ```
  id           uuid pk
  vehicle_id   uuid fk -> vehicles(id)
  provider     varchar(20)   -- 'infosimples' | 'mock' | 'manual'
  result       varchar(20)   -- 'approved' | 'needs_review' | 'rejected'
  matched      boolean       -- dados bateram com o cadastro?
  detail_json  jsonb         -- resposta resumida / motivo (sem PII sensível em claro)
  created_at   timestamptz default now()
  @@index([vehicle_id, created_at])
  ```

### 4.3 Backend

- `backend/src/infra/vehicleValidation/` com interface `VehicleValidationProvider`, `mock.ts`, `infosimples.ts`, `index.ts` (seleção por `VEHICLE_VALIDATION_PROVIDER`, default `mock`).
- `driver.service.ts` (`uploadCrlv`/novo `validateVehicle`): recebe placa+RENAVAM(+UF/chassi), chama o provedor, grava `vehicle_validations`, decide `Auto` × `Manual`.
- `isValidRenavam` em `domain/validators.ts` (11 dígitos com dígito verificador).

### 4.4 Mobile

- Cadastro de veículo (`become-driver`/`driver`): campos placa + RENAVAM (+ UF/chassi quando pedido).
- Feedback: "Documento validado automaticamente ✅" ou "Recebemos seus dados, vamos revisar em breve" (UX10/UX11).

---

## 5. Corridas agendadas (RF-novo, UX03, UX09, UX14)

Permitir agendar corrida para um horário futuro, com **busca geral** ou direcionada a um
**motorista favorito** (ver §6).

### 5.1 Regras de negócio

- **Preço:** a corrida agendada custa **10% a mais** que a tarifa normal equivalente (compensa a
  possível espera do motorista). Configurável: `SCHEDULED_SURCHARGE_PERCENT=10`.
- **Janela de matching:** o dispatch começa antes do horário agendado (config `SCHEDULE_DISPATCH_LEAD_MINUTES`, ex.: 15 min antes).
- **Favorito:** se agendada para um favorito, o dispatch **oferece primeiro** ao motorista escolhido por um tempo (ex.: 5 min); se ele não aceitar, cai para busca geral (sem quebrar a promessa da corrida).
- Cotação agendada gera um `RideQuote` marcado como agendado, com preço já acrescido dos 10%.

### 5.2 Estados e ciclo de vida

Novo estado inicial **`Scheduled`** antecede `Searching`:
```
Scheduled ──(no horário/lead)──► Searching ──► DriverAssigned ──► ... (fluxo normal)
Scheduled ──► Cancelled   (cancelamento antes de virar Searching)
```
- Atualizar `domain/rideState.ts`: adicionar `Scheduled` a `RideStatus`, transições `Scheduled → Searching | Cancelled`, e ações (passageiro pode `cancel`; sem `share`/`safety` enquanto não há motorista).
- Enum `RideStatus` no banco: `ADD VALUE 'Scheduled'`.
- Job de varredura (novo `jobs/scheduledRides.ts`, análogo aos jobs existentes) promove `Scheduled → Searching` quando faltar `lead` para o horário e dispara o `dispatch`.

### 5.3 Regra de cancelamento da corrida agendada

A janela de penalidade da agendada combina **os 3 min após o aceite** com **faltar ≤ 10 min para o
início**. Vale para **ambos os papéis**:

```
inicioAgendado = ride.scheduledAt
penalizavel = acceptedAt
           && (agora - acceptedAt) > 180s          // passou dos 3 min do aceite
           && (inicioAgendado - agora) <= 600s      // falta 10 min ou menos para começar
```
- **Passageiro** cancela dentro dessa janela → paga (mesmo cálculo de repasse do §1.4: motorista recebe `total − taxa`, plataforma fica com a taxa).
- **Motorista** cancela dentro dessa janela → sofre o debuff monetário (`CancellationPenalty`), e a corrida tenta rematch (se ainda der tempo) ou é cancelada avisando o passageiro.
- Fora dessa janela → sem penalidade.

### 5.4 Mudanças de banco

`<ts>_scheduled_rides/migration.sql`:
- `opendriver."RideStatus"`: `ADD VALUE 'Scheduled'`.
- `opendriver.rides`: `ADD COLUMN scheduled_at TIMESTAMPTZ`, `ADD COLUMN scheduled_favorite_driver_id UUID`, `ADD COLUMN is_scheduled BOOLEAN NOT NULL DEFAULT false`.
- `opendriver.ride_quotes`: `ADD COLUMN scheduled BOOLEAN NOT NULL DEFAULT false` (o preço já vem com +10%).

### 5.5 Backend e mobile

- `quote.service.ts`: parâmetro `scheduledAt`; quando presente, aplica `SCHEDULED_SURCHARGE_PERCENT` sobre a tarifa.
- `rides.service.ts`: `requestRide` aceita `scheduledAt` + `favoriteDriverId` opcionais → cria a corrida em `Scheduled` (sem dispatch imediato).
- `dispatch.ts`: ao promover, se houver favorito, oferta prioritária a ele antes da busca geral.
- Mobile: no fluxo `Origem → Destino → Confirmar`, opção "Agendar" (data/hora) e "Escolher motorista favorito"; lista de corridas agendadas no histórico com ação de cancelar.

---

## 6. Motoristas favoritos e lista (RF-novo, UX09)

- Nova tabela `opendriver.favorite_drivers` (`id`, `passenger_id`, `driver_id`, `created_at`, `@@unique([passenger_id, driver_id])`, FKs `ON DELETE RESTRICT` para `public.users`).
- Endpoints: `GET/POST/DELETE /api/v1/me/favorites` (listar, adicionar, remover). Ao concluir uma corrida, oferecer "Adicionar motorista aos favoritos".
- Usado no agendamento (§5) e, opcionalmente, para dar leve prioridade a favoritos em corridas imediatas quando o motorista estiver online e livre.
- Complemento (do item de melhorias): **bloquear** um usuário (evitar rematch) — tabela análoga `blocked_users`, respeitada no `dispatch.ts`.
- Mobile: tela de favoritos na conta; estrela/coração para favoritar no recibo da corrida.

---

## 7. Corrida "apenas mulheres" (RF-novo, UX13, segurança)

Passageira mulher pode pedir corrida atendida somente por **motorista mulher**; motorista mulher
pode optar por aceitar **somente passageiras**.

- Depende de conhecer o **gênero** do usuário. O schema `public.users` (hub) **não pode ser
  alterado** por este serviço; então guardamos a preferência/gênero em perfis do `opendriver`:
  - `opendriver.passenger_profiles`: `ADD COLUMN gender VARCHAR(12)`, `ADD COLUMN women_only_pref BOOLEAN NOT NULL DEFAULT false`.
  - `opendriver.driver_profiles`: `ADD COLUMN gender VARCHAR(12)`, `ADD COLUMN women_only_pref BOOLEAN NOT NULL DEFAULT false`.
  - Coleta de gênero opt-in no cadastro/onboarding, com finalidade explícita (segurança) e tratamento LGPD.
- **Matching** (`dispatch.ts`): quando a corrida é `women_only` (passageira marcou), candidatas = apenas motoristas com `gender = 'female'`. Motorista com `women_only_pref` só recebe ofertas de passageiras mulheres.
- `Ride`: `ADD COLUMN women_only BOOLEAN NOT NULL DEFAULT false` (trava a regra na corrida).
- Mobile: alternador "Apenas mulheres" no pedido (visível só para passageiras mulheres) e nas preferências da motorista mulher. Mensagens claras quando não há motorista compatível (UX11).

> Nota de produto/jurídica: definir a política de verificação de gênero e a comunicação, alinhada
> à legislação e às diretrizes das lojas. Recomenda-se opt-in e não expor o gênero de terceiros.

---

## 8. Código/PIN de embarque com regra de 5 minutos (RF15, UX10, UX14)

Confirma que o passageiro certo entrou no carro certo e regula o "no-show".

### 8.1 Regra

- Ao pedir a corrida, o passageiro recebe um **código de 4 dígitos**. O motorista só consegue
  **Iniciar** a corrida (`DriverArrived → InProgress`) após digitar o código correto.
- Após o motorista marcar **"Cheguei"** (`DriverArrived`), conta-se **5 minutos**. Se a corrida não
  iniciar (código não inserido) nesse prazo, o motorista pode tocar em **"Passageiro não
  compareceu"** → corrida é encerrada como no-show e o **passageiro paga** (mesmo cálculo de
  cancelamento tardio: motorista recebe `total − taxa`; plataforma fica com a taxa).
- Vale igual para **corrida normal e agendada**.
- Acima do botão "Cancelar", o motorista tem o campo para **inserir o código a qualquer momento** —
  inclusive **depois** dos 5 minutos. Se inserir o código (mesmo após 5 min), a corrida segue
  **normal** (não é no-show), pois o passageiro apareceu.

### 8.2 Mudanças de banco

`<ts>_pickup_code/migration.sql`:
- `opendriver.rides`: `ADD COLUMN pickup_code VARCHAR(4)`, `ADD COLUMN no_show_at TIMESTAMPTZ`.
- `opendriver."RideActor"` já tem `Driver`; registrar evento `no_show` em `ride_events`.

### 8.3 Backend — `rides.service.ts`

- `requestRide`: gera `pickupCode` (4 dígitos aleatórios). Exposto ao passageiro no DTO; ao motorista **nunca** (ele só valida).
- `startRide`: passa a exigir `code`; só transiciona se `code === ride.pickupCode`. Erro claro se errado.
- Novo `markNoShow(rideId, driverId)`: permitido só em `DriverArrived` e se `agora - arrivedAt > 300s`; encerra a corrida cobrando o passageiro (repasse ao motorista como no §1.4).
- `driverActions` (`rideState.ts`): em `DriverArrived`, incluir `start` (com código) e, após 5 min, `no_show`.

### 8.4 Mobile

- Passageiro: mostra o código de forma destacada no card da corrida (UX10).
- Motorista: campo de código acima do botão Cancelar; botão "Passageiro não compareceu" habilita após 5 min de `arrivedAt` (contador visível).

---

## 9. Pin no mapa para embarque/destino (RF07, UX03, UX09)

Quando o passageiro não acha o endereço na busca por texto, ele **arrasta um pin no mapa** e usamos
as coordenadas diretamente.

- O backend já suporta isso: `geocoding.reverse(point)` devolve um `Place` e, **sem Nominatim,
  cai num endereço genérico "Local no mapa (lat, lng)"** sem quebrar a corrida. A cotação e a
  corrida funcionam com lat/lng puros.
- Mobile: no seletor de origem/destino, botão "Marcar no mapa" abre um mapa (reutiliza `RideMap`)
  com um pin central arrastável; ao confirmar, chama `reverse` para exibir o endereço aproximado e
  segue com as coordenadas. Já existe base para "Local no mapa" no `reverse`.
- Salvar o ponto como `SavedPlace` opcionalmente (UX09).

---

## 10. Decisão de geocoding: Nominatim (atual) vs Google Maps

**Pergunta:** é grátis pesquisar o endereço digitado no Google Maps quando não temos na nossa base?

**Resposta curta:** **não é totalmente grátis.** O modelo do Google mudou em março de 2025: acabou
o crédito único de US$ 200/mês e cada SKS passou a ter uma **cota mensal grátis por categoria**
(Essentials ~10.000 eventos/mês; Pro ~5.000; Enterprise ~1.000); acima da cota, cobra **por 1.000
requisições** (a faixa de Geocoding historicamente ~US$ 5/1.000, podendo variar por SKU/tier/volume).
*Conteúdo rephrase para compliance de licenciamento.* Fontes:
[pricing](https://developers.google.com/maps/billing-and-pricing/pricing),
[geocoding usage & billing](https://developers.google.com/maps/documentation/geocoding/usage-and-billing).

**Situação atual do projeto:** já usamos **Nominatim (OpenStreetMap)** em `infra/geo/geocoding.ts`
para busca (`search`) e reverse (`reverse`), com cache em memória e fallback gracioso. É a mesma
família OSM do OSRM/MapLibre já adotada. O Nominatim público **proíbe uso comercial pesado** — em
produção precisa de instância própria (ou provedor gerenciado compatível).

**Recomendação (em camadas, barato primeiro):**
1. Manter **Nominatim** como provedor primário (self-host em produção; já está integrado).
2. Se a busca não retornar resultado suficiente, oferecer o **pin no mapa** (§9) — resolve a maioria
   dos casos sem custo.
3. **Opcional**, atrás de flag (`GEOCODER_FALLBACK=google`): usar Google Geocoding **só como
   fallback** quando o Nominatim falha, para ficar dentro da cota grátis e minimizar custo. Encapsular
   num provedor plugável em `infra/geo/` (mesmo padrão dos demais), com a chave em
   `integration_settings`.

Assim, no dia a dia o custo é ~zero e o Google entra só na cauda de endereços difíceis, se e quando
o negócio quiser ligar.

---

## 11. Demais sugestões de melhoria

Mantidas do plano anterior (as que você aprovou), além das já incorporadas acima (favoritos §6,
apenas mulheres §7, PIN §8, pin no mapa §9):

1. **Chat/contato mascarado** motorista↔passageiro (mensagens rápidas + ligação com número mascarado).
2. **ETA sempre visível** (já há `etaMany`/`liveRoute`): "chega em ~5 min" no card e no acompanhamento compartilhado.
3. **Parada extra/mudança de destino** no meio da viagem, recotando o preço.
4. **Antifraude de localização** (detectar mock GPS no app do motorista; `driverTracking` já coleta `accuracy`).
5. **Gorjeta pós-corrida** opcional, cai no livro-caixa do motorista.
6. **Métricas de qualidade por motorista** (aceite, cancelamento, nota) para matching e admin (RF17).
7. **Modo acessibilidade** (categoria PCD, preferências salvas).
8. **Recibo/nota por e-mail** ao concluir (reaproveita `infra/email.ts`).

---

## 12. Ordem de execução sugerida

1. **Fase 1 — Cancelamento (§1) + Rating meia estrela (§2) + PIN de embarque (§8).** Só backend + mobile, sem terceiros; formam o núcleo de regras de corrida.
2. **Fase 2 — Central de reclamações com foto (§3)** (reaproveita storage cifrado).
3. **Fase 3 — Favoritos (§6) + Corridas agendadas (§5).** Dependem entre si (agendar para favorito).
4. **Fase 4 — Apenas mulheres (§7)** (envolve política de gênero/LGPD).
5. **Fase 5 — Validação de CRLV via Infosimples (§4)** (integração externa; `mock` primeiro, depois credenciais reais).
6. **Fase 6 — Geocoding: pin no mapa (§9) já na Fase 1/2; fallback Google (§10) opcional.**
7. **Fase 7 — Melhorias do §11** conforme produto.

## 13. Verificação por frente (Definition of Done)

- **Cancelamento:** testes cobrindo antes/depois de 3 min, ambos os papéis, repasse `fare − fee`, penalidade negativa, motivo obrigatório, rating **não** alterado.
- **Rating:** conversão de dados antigos (×2) idempotente, média com meia estrela, passos inválidos recusados (ex.: 3,7), unicidade por corrida.
- **Reclamações:** upload cifrado (só `image/*`, limites), leitura só por admin, alerta à equipe, fila offline.
- **CRLV/Infosimples:** provedor `mock` determinístico; validação de placa/RENAVAM; auditoria em `vehicle_validations`; queda para revisão manual em divergência/indisponibilidade; free tier gasto só em validação real.
- **Agendadas:** preço +10% aplicado, promoção `Scheduled → Searching` no lead time, oferta prioritária ao favorito, janela de penalidade (3 min do aceite E ≤ 10 min do início) para ambos os papéis.
- **Favoritos:** unicidade, uso no agendamento, remoção; bloqueio respeitado no dispatch.
- **Apenas mulheres:** matching filtra por gênero nos dois sentidos; sem exposição de gênero de terceiros; mensagem clara sem motorista compatível.
- **PIN:** iniciar exige código correto; no-show só após 5 min de `arrivedAt`; inserir código após 5 min normaliza a corrida.
- **Pin no mapa:** corrida funciona só com lat/lng; reverse com fallback "Local no mapa".
- Rodar build/lint/testes do backend e do mobile (`jest`) antes de fechar cada fase; limpar temporários.

## 14. Riscos e pontos de atenção

- **`DriverEarning @@unique([rideId, type])`**: uma corrida pode gerar mais de um lançamento de cancelamento (motorista A cancela, B pega e cancela). Revisar a chave única ou diferenciar por evento.
- **Saldo negativo do motorista** por penalidade: bloquear saque até quitar; nunca cobrar cartão do motorista.
- **Migração de rating**: idempotente e única (rodar 2× multiplica por 4). Proteger com verificação.
- **CRLV/Infosimples**: dados de veículo/proprietário são pessoais (LGPD); guardar só o necessário; token em `integration_settings`; sempre ter fallback para revisão manual; a UF `TO` exige CPF/CNPJ.
- **Apenas mulheres / gênero**: dado sensível; opt-in, finalidade explícita, sem expor terceiros; alinhar política com jurídico e lojas.
- **Corridas agendadas**: garantir cobertura de motorista no horário (comunicar risco de "sem motorista"); o job de promoção deve ser idempotente e resistente a reinício, como os jobs atuais.
- **Google Geocoding**: só como fallback atrás de flag para não estourar custo; monitorar consumo se ligado.
