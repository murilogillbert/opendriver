# Princípios de UX e Interação

## 1. Princípio central

O aplicativo deverá ser projetado para que passageiros e motoristas pensem e interajam o mínimo possível para executar as ações principais.

A interface deverá priorizar:

- simplicidade;
- objetividade;
- rapidez;
- previsibilidade;
- baixa carga cognitiva;
- poucas etapas;
- informações apresentadas no momento correto;
- ações principais claramente destacadas.

O objetivo não é eliminar funcionalidades ou informações, mas **ocultar a complexidade até que ela seja necessária**.

Funcionalidades avançadas poderão existir em telas secundárias, menus, expansões ou etapas posteriores, sem interferir nas tarefas principais.

## 2. Hierarquia de interação

As funcionalidades deverão ser classificadas em três níveis.

### Nível 1 — Ações principais

Devem estar imediatamente disponíveis e exigir o mínimo de interação possível.

- pedir corrida;
- aceitar corrida;
- iniciar viagem;
- finalizar viagem;
- pagar;
- acessar o Hub;
- ficar online/offline.

### Nível 2 — Informações e ações secundárias

Podem exigir uma interação adicional.

- detalhes da corrida;
- informações do motorista;
- detalhes do pagamento;
- histórico;
- avaliação;
- configurações;
- informações do veículo.

### Nível 3 — Funcionalidades avançadas

Não devem ocupar espaço na interface principal.

- configurações avançadas;
- gerenciamento detalhado da conta;
- documentação;
- verificações;
- informações financeiras detalhadas;
- relatórios;
- preferências;
- informações técnicas.

Esses recursos continuarão disponíveis, mas serão acessados somente quando necessários.

## 3. Regra de simplificação

> Mostrar primeiro o que o usuário precisa fazer; mostrar detalhes somente quando o usuário precisar deles.

Exemplo — solicitação de corrida, interface principal:

```text
De onde?
[ Meu local ]

Para onde?
[ Digite o destino ]

        [ BUSCAR ]
```

Depois da busca:

```text
Destino
Shopping Pantanal

R$ 32,50
~12 min

        [ PEDIR CORRIDA ]
```

Detalhes adicionais poderão ser acessados por **"Ver detalhes"**, sem ocupar a interface principal.

## 4. Solicitação de corrida

A solicitação deverá ser uma das interações mais simples do aplicativo.

```text
Origem → Destino → Buscar → Confirmar
```

Sempre que possível, a forma de pagamento padrão deverá ser utilizada automaticamente. O usuário não deverá precisar selecionar novamente:

- cartão;
- saldo;
- categoria;
- endereço;
- outras configurações já conhecidas pelo sistema.

Caso exista apenas uma opção válida, ela deverá ser selecionada automaticamente.

## 5. Pagamento

O pagamento deverá possuir baixa fricção. Se o usuário possuir uma forma de pagamento padrão:

```text
Corrida finalizada → Pagamento automático → Recibo
```

Não deverá existir uma tela obrigatória de confirmação caso a operação já esteja autorizada. A tela poderá apresentar:

```text
Corrida concluída

R$ 32,50

Pago com •••• 4821

[ Avaliar ]
```

Detalhes financeiros poderão ser acessados posteriormente.

## 6. Acesso ao Hub

O Hub deverá ser uma das funcionalidades mais diretas do aplicativo.

```text
Bottom Navigation → HUB → OpenDriverHub (usuário já autenticado)
```

Não deverá existir:

- novo cadastro;
- nova senha;
- nova autenticação;
- tela intermediária desnecessária.

O usuário toca em Hub e chega diretamente ao ambiente de benefícios.

## 7. Interface do motorista

O motorista deverá possuir uma interface operacional extremamente objetiva.

Offline:

```text
Você está offline

       [ FICAR ONLINE ]

Ganhos hoje
R$ 184,50
```

Online:

```text
Você está online

       MAPA

Procurando viagens...
```

Nova corrida — informação resumida:

```text
Nova corrida

2,4 km até passageiro
~8 min
Destino: Centro
R$ 28,50

[ RECUSAR ]    [ ACEITAR ]
```

Informações adicionais poderão ser expandidas.

## 8. Informações progressivas (progressive disclosure)

Informações complexas não serão removidas; serão apresentadas somente quando necessárias.

```text
Corrida

R$ 42,00
Centro → Jardim Itália

[ Ver detalhes ]
```

Ao tocar:

```text
Detalhes

Distância: 8,4 km
Tempo estimado: 17 min
Tarifa base: R$ X
Tarifa distância: R$ X
Taxas: R$ X
Forma de pagamento: X
```

## 9. Quantidade de etapas

As ações de alta frequência deverão utilizar o menor número possível de telas.

| Ação                        | Objetivo de interações                                   | Fluxo                      |
| --------------------------- | -------------------------------------------------------- | -------------------------- |
| Solicitar corrida           | 2–3 interações principais                                | Origem → Destino → Pedir   |
| Acessar Hub                 | 1 interação                                              | Hub → OpenDriverHub        |
| Pagar                       | 0 interações adicionais (com método válido cadastrado)   | —                          |
| Motorista aceitar corrida   | 1 interação                                              | Aceitar                    |
| Iniciar viagem              | 1 interação                                              | Iniciar                    |
| Finalizar viagem            | 1 interação                                              | Finalizar                  |

## 10. Informações obrigatórias x opcionais

Cada tela deverá distinguir:

- **Obrigatório** — informação necessária para executar a ação.
- **Opcional** — informação complementar que não deve impedir a execução.
- **Avançado** — informação que somente deverá aparecer mediante interação adicional.

```text
┌──────────────────────────────┐
│        CORRIDA               │
│                              │
│  Shopping Pantanal           │
│  R$ 32,50                    │
│  ~12 min                     │
│                              │
│       [ PEDIR CORRIDA ]      │
│                              │
│       Ver detalhes           │
└──────────────────────────────┘
```

## 11. Consistência de ações

A mesma ação deverá possuir sempre o mesmo comportamento e linguagem.

| Termo      | Significado único                        |
| ---------- | ---------------------------------------- |
| Aceitar    | aceitar uma corrida                      |
| Cancelar   | cancelar uma operação                    |
| Iniciar    | iniciar a viagem                         |
| Finalizar  | finalizar                                |
| Voltar     | retornar ao contexto anterior            |

## 12. Redução de entrada manual

Sempre que o sistema já possuir uma informação válida, o usuário não deverá digitá-la novamente: localização atual, endereço recente, forma de pagamento, dados pessoais, telefone, e-mail, veículo, chave Pix.

O sistema deverá preferir **selecionar → confirmar** em vez de **digitar → preencher → revisar → confirmar**.

## 13. Valores padrão inteligentes

- último método de pagamento;
- localização atual;
- categoria mais utilizada;
- endereço recente;
- preferências do usuário;
- configurações previamente autorizadas.

O usuário poderá alterar essas opções quando necessário.

## 14. Tratamento de exceções

A simplificação não poderá esconder situações importantes. Quando houver um problema, a interface deverá apresentar:

1. o que aconteceu;
2. o que o usuário precisa fazer;
3. uma ação clara.

```text
Não foi possível solicitar a corrida.

Verifique sua forma de pagamento.

[ CORRIGIR PAGAMENTO ]
```

Evitar mensagens técnicas como "Erro HTTP 402 / Payment Required".

## 15. Segurança sem fricção desnecessária

Os recursos de segurança deverão estar disponíveis de forma rápida, especialmente durante uma viagem. Ações de maior risco poderão exigir etapas adicionais.

> Segurança deve aumentar a proteção sem criar complexidade desnecessária para as ações rotineiras.

## 16. Regra geral de design

Para cada funcionalidade, a equipe deverá responder:

> **Qual é a ação que o usuário veio realizar nesta tela?**

Essa ação deverá ser visualmente dominante. As demais informações deverão ser secundárias, expansíveis, acessíveis por menus, apresentadas sob demanda ou transferidas para uma tela de detalhes.

## 17. Critério de avaliação da interface

Além dos requisitos funcionais, a interface deverá ser avaliada pelo esforço necessário para realizar as ações principais:

- baixa quantidade de toques;
- baixa necessidade de digitação;
- baixa necessidade de leitura;
- baixa quantidade de decisões;
- baixa quantidade de telas;
- baixo número de confirmações;
- recuperação simples de erros.

A complexidade do sistema deve permanecer no backend, e não ser transferida para o usuário.

## 18. Princípio final

A infraestrutura e a lógica de negócio podem ser complexas, mas essa complexidade deverá ser abstraída pela interface.

- **Passageiro:** Escolher → Confirmar → Usar.
- **Motorista:** Aceitar → Ir → Iniciar → Dirigir → Finalizar.
- **Ecossistema:** Tocar no Hub → Entrar diretamente.

As funcionalidades avançadas permanecerão disponíveis, porém não deverão interferir nos fluxos principais.
