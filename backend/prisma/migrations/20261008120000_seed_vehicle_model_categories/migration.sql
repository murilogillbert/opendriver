-- Carga inicial da tabela de classificação de veículos.
--
-- Vai em migration, e não em script de semente, porque é como o resto da configuração de
-- operação deste repositório já é carregada (`pricing`, `detran_providers`): não existe
-- `prisma/seed` aqui, e inventar um caminho novo só para esta tabela criaria duas formas de
-- carregar dado de referência.
--
-- O que está aqui é a frota comum de MS, MT, GO e DF — os quatro estados onde a operação
-- começa. Não é uma tabela de todos os carros do Brasil, e não deveria ser: o resto se
-- resolve pela importação de CSV e pelo cadastro no admin, que é justamente o motivo de a
-- tabela ser editável.
--
-- `source = 'semente'` separa esta carga do que o operador cadastrou à mão ('manual') e do
-- que veio de planilha ('importado'). Importar CSV com `substituirImportadas` apaga só as
-- 'importado' — a semente e o trabalho manual sobrevivem.
--
-- ============================================================================
-- Como as marcas estão escritas
-- ============================================================================
--
-- Em nome canônico, maiúsculas e sem acento. O Detran devolve código do Renavam
-- (`VW/GOL 1.0`, `GM/ONIX`, `MMC/L200`), e `canonizarMarca` em `domain/vehicleCategory.ts`
-- traduz VW -> VOLKSWAGEN, GM -> CHEVROLET, MMC -> MITSUBISHI antes de comparar. Escrever o
-- apelido aqui funcionaria também, mas deixaria a tabela ilegível para quem a edita no admin.
--
-- ============================================================================
-- Por que não existe regra "toda a marca é Econômico"
-- ============================================================================
--
-- Seria cômodo e estaria errado. Uma regra de marca inteira classificaria como Econômico todo
-- modelo não listado daquela marca — inclusive um SUV grande que ainda não entrou na tabela.
-- Combinado com a política "a menor vence", o efeito seria rebaixar carro legítimo de
-- Conforto e reduzir o que o motorista recebe, por omissão da tabela e não por decisão de
-- ninguém.
--
-- Sem regra que case, `calcularCategoria` devolve NULL, e NULL significa "a declaração do
-- motorista permanece". É o comportamento de hoje, preservado para o que a tabela ainda não
-- cobre — e a fila de divergência mostra onde ela precisa crescer.
--
-- A exceção são as marcas em que a marca inteira *é* a resposta: Mercedes, BMW, Audi, Volvo,
-- Land Rover, Jaguar, Porsche, Lexus e Mini não têm modelo de entrada em circulação aqui que
-- justifique Econômico. Essas vão com `model_pattern` vazio e prioridade baixa, e qualquer
-- exceção futura entra com prioridade menor ainda.
--
-- ============================================================================
-- Prioridade
-- ============================================================================
--
-- Menor ganha. A faixa deixa espaço para o operador encaixar exceção sem renumerar nada:
--
--   10  — marca inteira premium
--   50  — modelo específico (sobrepõe a marca premium quando precisar)
--   100 — modelo comum (o padrão do formulário do admin)
--
-- `model_pattern` casa por **prefixo** sobre o texto normalizado: a regra "COROLLA" cobre
-- "COROLLA XEI 2.0 FLEX", e a regra "COROLLA CROSS" é mais longa e ganha o desempate quando
-- as prioridades se igualam.

INSERT INTO "opendriver"."vehicle_model_categories"
  ("brand", "model_pattern", "year_from", "year_to", "category", "priority", "source", "active")
VALUES
  -- ---------------------------------------------------------------- CHEVROLET (GM)
  ('CHEVROLET', 'ONIX',          NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'PRISMA',        NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'JOY',           NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'CELTA',         NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'CORSA',         NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'CLASSIC',       NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'AGILE',         NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'COBALT',        NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'SPIN',          NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'MONTANA',       NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHEVROLET', 'TRACKER',       NULL, NULL, 'Comfort', 100, 'semente', true),
  ('CHEVROLET', 'CRUZE',         NULL, NULL, 'Comfort', 100, 'semente', true),
  ('CHEVROLET', 'EQUINOX',       NULL, NULL, 'Comfort', 100, 'semente', true),
  ('CHEVROLET', 'S10',           NULL, NULL, 'Comfort', 100, 'semente', true),
  ('CHEVROLET', 'TRAILBLAZER',   NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- VOLKSWAGEN (VW)
  ('VOLKSWAGEN', 'GOL',          NULL, NULL, 'Economy', 100, 'semente', true),
  ('VOLKSWAGEN', 'VOYAGE',       NULL, NULL, 'Economy', 100, 'semente', true),
  ('VOLKSWAGEN', 'FOX',          NULL, NULL, 'Economy', 100, 'semente', true),
  ('VOLKSWAGEN', 'UP',           NULL, NULL, 'Economy', 100, 'semente', true),
  ('VOLKSWAGEN', 'POLO',         NULL, NULL, 'Economy', 100, 'semente', true),
  ('VOLKSWAGEN', 'SAVEIRO',      NULL, NULL, 'Economy', 100, 'semente', true),
  ('VOLKSWAGEN', 'SPACEFOX',     NULL, NULL, 'Economy', 100, 'semente', true),
  ('VOLKSWAGEN', 'VIRTUS',       NULL, NULL, 'Comfort', 100, 'semente', true),
  ('VOLKSWAGEN', 'JETTA',        NULL, NULL, 'Comfort', 100, 'semente', true),
  ('VOLKSWAGEN', 'NIVUS',        NULL, NULL, 'Comfort', 100, 'semente', true),
  ('VOLKSWAGEN', 'T CROSS',      NULL, NULL, 'Comfort', 100, 'semente', true),
  ('VOLKSWAGEN', 'TAOS',         NULL, NULL, 'Comfort', 100, 'semente', true),
  ('VOLKSWAGEN', 'TIGUAN',       NULL, NULL, 'Comfort', 100, 'semente', true),
  ('VOLKSWAGEN', 'AMAROK',       NULL, NULL, 'Comfort', 100, 'semente', true),
  ('VOLKSWAGEN', 'GOLF',         NULL, NULL, 'Comfort', 100, 'semente', true),
  ('VOLKSWAGEN', 'PASSAT',       NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- FIAT
  ('FIAT', 'UNO',                NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'MOBI',               NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'ARGO',               NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'PALIO',              NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'SIENA',              NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'GRAND SIENA',        NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'PUNTO',              NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'IDEA',               NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'CRONOS',             NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'STRADA',             NULL, NULL, 'Economy', 100, 'semente', true),
  ('FIAT', 'PULSE',              NULL, NULL, 'Comfort', 100, 'semente', true),
  ('FIAT', 'FASTBACK',           NULL, NULL, 'Comfort', 100, 'semente', true),
  ('FIAT', 'TORO',               NULL, NULL, 'Comfort', 100, 'semente', true),
  ('FIAT', 'FREEMONT',           NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- HYUNDAI
  ('HYUNDAI', 'HB20',            NULL, NULL, 'Economy', 100, 'semente', true),
  ('HYUNDAI', 'I30',             NULL, NULL, 'Economy', 100, 'semente', true),
  -- O HB20S é sedã do mesmo porte do hatch: Econômico, e com prioridade menor para ganhar da
  -- regra "HB20" por prefixo caso alguém mude a prioridade dela depois.
  ('HYUNDAI', 'HB20S',           NULL, NULL, 'Economy',  50, 'semente', true),
  ('HYUNDAI', 'CRETA',           NULL, NULL, 'Comfort', 100, 'semente', true),
  ('HYUNDAI', 'TUCSON',          NULL, NULL, 'Comfort', 100, 'semente', true),
  ('HYUNDAI', 'SANTA FE',        NULL, NULL, 'Comfort', 100, 'semente', true),
  ('HYUNDAI', 'ELANTRA',         NULL, NULL, 'Comfort', 100, 'semente', true),
  ('HYUNDAI', 'AZERA',           NULL, NULL, 'Comfort', 100, 'semente', true),
  ('HYUNDAI', 'IX35',            NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- TOYOTA
  ('TOYOTA', 'ETIOS',            NULL, NULL, 'Economy', 100, 'semente', true),
  ('TOYOTA', 'YARIS',            NULL, NULL, 'Economy', 100, 'semente', true),
  ('TOYOTA', 'COROLLA',          NULL, NULL, 'Comfort', 100, 'semente', true),
  ('TOYOTA', 'COROLLA CROSS',    NULL, NULL, 'Comfort',  50, 'semente', true),
  ('TOYOTA', 'HILUX',            NULL, NULL, 'Comfort', 100, 'semente', true),
  ('TOYOTA', 'SW4',              NULL, NULL, 'Comfort', 100, 'semente', true),
  ('TOYOTA', 'RAV4',             NULL, NULL, 'Comfort', 100, 'semente', true),
  ('TOYOTA', 'CAMRY',            NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- RENAULT
  ('RENAULT', 'KWID',            NULL, NULL, 'Economy', 100, 'semente', true),
  ('RENAULT', 'SANDERO',         NULL, NULL, 'Economy', 100, 'semente', true),
  ('RENAULT', 'LOGAN',           NULL, NULL, 'Economy', 100, 'semente', true),
  ('RENAULT', 'CLIO',            NULL, NULL, 'Economy', 100, 'semente', true),
  ('RENAULT', 'STEPWAY',         NULL, NULL, 'Economy', 100, 'semente', true),
  ('RENAULT', 'LOGAN STEPWAY',   NULL, NULL, 'Economy',  50, 'semente', true),
  ('RENAULT', 'DUSTER',          NULL, NULL, 'Comfort', 100, 'semente', true),
  ('RENAULT', 'OROCH',           NULL, NULL, 'Comfort', 100, 'semente', true),
  ('RENAULT', 'CAPTUR',          NULL, NULL, 'Comfort', 100, 'semente', true),
  ('RENAULT', 'KARDIAN',         NULL, NULL, 'Comfort', 100, 'semente', true),
  ('RENAULT', 'FLUENCE',         NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- FORD
  ('FORD', 'KA',                 NULL, NULL, 'Economy', 100, 'semente', true),
  ('FORD', 'FIESTA',             NULL, NULL, 'Economy', 100, 'semente', true),
  ('FORD', 'ECOSPORT',           NULL, NULL, 'Comfort', 100, 'semente', true),
  ('FORD', 'FOCUS',              NULL, NULL, 'Comfort', 100, 'semente', true),
  ('FORD', 'FUSION',             NULL, NULL, 'Comfort', 100, 'semente', true),
  ('FORD', 'RANGER',             NULL, NULL, 'Comfort', 100, 'semente', true),
  ('FORD', 'TERRITORY',          NULL, NULL, 'Comfort', 100, 'semente', true),
  ('FORD', 'BRONCO',             NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- HONDA
  ('HONDA', 'FIT',               NULL, NULL, 'Economy', 100, 'semente', true),
  ('HONDA', 'CITY',              NULL, NULL, 'Economy', 100, 'semente', true),
  ('HONDA', 'CIVIC',             NULL, NULL, 'Comfort', 100, 'semente', true),
  ('HONDA', 'HR V',              NULL, NULL, 'Comfort', 100, 'semente', true),
  ('HONDA', 'WR V',              NULL, NULL, 'Comfort', 100, 'semente', true),
  ('HONDA', 'CR V',              NULL, NULL, 'Comfort', 100, 'semente', true),
  ('HONDA', 'ACCORD',            NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- NISSAN
  ('NISSAN', 'MARCH',            NULL, NULL, 'Economy', 100, 'semente', true),
  ('NISSAN', 'VERSA',            NULL, NULL, 'Economy', 100, 'semente', true),
  ('NISSAN', 'LIVINA',           NULL, NULL, 'Economy', 100, 'semente', true),
  ('NISSAN', 'KICKS',            NULL, NULL, 'Comfort', 100, 'semente', true),
  ('NISSAN', 'SENTRA',           NULL, NULL, 'Comfort', 100, 'semente', true),
  ('NISSAN', 'FRONTIER',         NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- PEUGEOT / CITROEN
  ('PEUGEOT', '208',             NULL, NULL, 'Economy', 100, 'semente', true),
  ('PEUGEOT', '207',             NULL, NULL, 'Economy', 100, 'semente', true),
  ('PEUGEOT', '206',             NULL, NULL, 'Economy', 100, 'semente', true),
  ('PEUGEOT', '2008',            NULL, NULL, 'Comfort', 100, 'semente', true),
  ('PEUGEOT', '3008',            NULL, NULL, 'Comfort', 100, 'semente', true),
  ('PEUGEOT', '408',             NULL, NULL, 'Comfort', 100, 'semente', true),
  ('CITROEN', 'C3',              NULL, NULL, 'Economy', 100, 'semente', true),
  ('CITROEN', 'C4',              NULL, NULL, 'Comfort', 100, 'semente', true),
  ('CITROEN', 'BASALT',          NULL, NULL, 'Comfort', 100, 'semente', true),
  -- "C3 AIRCROSS" e não "AIRCROSS": o casamento é por prefixo, e o Detran devolve o modelo
  -- como "C3 AIRCROSS ...". Um padrão "AIRCROSS" nunca casaria, e a regra "C3" (Econômico)
  -- levaria o SUV. Prioridade 50 para ganhar da "C3", que também casa por prefixo.
  ('CITROEN', 'C3 AIRCROSS',     NULL, NULL, 'Comfort',  50, 'semente', true),

  -- ---------------------------------------------------------------- JEEP / RAM / MITSUBISHI
  ('JEEP', 'RENEGADE',           NULL, NULL, 'Comfort', 100, 'semente', true),
  ('JEEP', 'COMPASS',            NULL, NULL, 'Comfort', 100, 'semente', true),
  ('JEEP', 'COMMANDER',          NULL, NULL, 'Comfort', 100, 'semente', true),
  ('MITSUBISHI', 'L200',         NULL, NULL, 'Comfort', 100, 'semente', true),
  ('MITSUBISHI', 'ASX',          NULL, NULL, 'Comfort', 100, 'semente', true),
  ('MITSUBISHI', 'OUTLANDER',    NULL, NULL, 'Comfort', 100, 'semente', true),
  ('MITSUBISHI', 'PAJERO',       NULL, NULL, 'Comfort', 100, 'semente', true),
  ('MITSUBISHI', 'ECLIPSE',      NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- KIA / CHERY / JAC
  ('KIA', 'PICANTO',             NULL, NULL, 'Economy', 100, 'semente', true),
  ('KIA', 'CERATO',              NULL, NULL, 'Comfort', 100, 'semente', true),
  ('KIA', 'SPORTAGE',            NULL, NULL, 'Comfort', 100, 'semente', true),
  ('KIA', 'SORENTO',             NULL, NULL, 'Comfort', 100, 'semente', true),
  ('CHERY', 'QQ',                NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHERY', 'CELER',             NULL, NULL, 'Economy', 100, 'semente', true),
  ('CHERY', 'TIGGO',             NULL, NULL, 'Comfort', 100, 'semente', true),
  ('CHERY', 'ARRIZO',            NULL, NULL, 'Comfort', 100, 'semente', true),
  ('JAC', 'J2',                  NULL, NULL, 'Economy', 100, 'semente', true),
  ('JAC', 'J3',                  NULL, NULL, 'Economy', 100, 'semente', true),
  ('JAC', 'T40',                 NULL, NULL, 'Economy', 100, 'semente', true),
  ('JAC', 'T50',                 NULL, NULL, 'Comfort', 100, 'semente', true),
  ('JAC', 'T60',                 NULL, NULL, 'Comfort', 100, 'semente', true),

  -- ---------------------------------------------------------------- marcas premium, por marca
  -- `model_pattern` vazio = a marca inteira. Prioridade 10 para qualquer exceção futura
  -- entrar acima dela sem renumerar nada.
  ('MERCEDES BENZ', '',          NULL, NULL, 'Comfort',  10, 'semente', true),
  ('BMW', '',                    NULL, NULL, 'Comfort',  10, 'semente', true),
  ('AUDI', '',                   NULL, NULL, 'Comfort',  10, 'semente', true),
  ('VOLVO', '',                  NULL, NULL, 'Comfort',  10, 'semente', true),
  ('LAND ROVER', '',             NULL, NULL, 'Comfort',  10, 'semente', true),
  ('JAGUAR', '',                 NULL, NULL, 'Comfort',  10, 'semente', true),
  ('PORSCHE', '',                NULL, NULL, 'Comfort',  10, 'semente', true),
  ('LEXUS', '',                  NULL, NULL, 'Comfort',  10, 'semente', true),
  ('MINI', '',                   NULL, NULL, 'Comfort',  10, 'semente', true),
  ('BYD', '',                    NULL, NULL, 'Comfort',  10, 'semente', true),
  ('GWM', '',                    NULL, NULL, 'Comfort',  10, 'semente', true),
  ('RAM', '',                    NULL, NULL, 'Comfort',  10, 'semente', true)

-- O índice único usa COALESCE nas faixas de ano, então o alvo do conflito tem de repetir a
-- expressão — `ON CONFLICT ("brand", "model_pattern", "year_from", "year_to")` não casaria com
-- ele e a migration falharia ao rodar duas vezes.
ON CONFLICT ("brand", "model_pattern", COALESCE("year_from", 0), COALESCE("year_to", 9999))
DO NOTHING;
