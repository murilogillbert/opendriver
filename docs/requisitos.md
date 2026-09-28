# Requisitos — Funcionais (RF) e de Experiência do Usuário (UX)

Os requisitos do aplicativo são divididos entre **Requisitos Funcionais (RF)** e **Requisitos de Experiência do Usuário (UX)**.

Essa separação é necessária porque uma funcionalidade pode estar tecnicamente correta e, ainda assim, apresentar uma experiência inadequada.

Os princípios que fundamentam os requisitos de UX estão em [principios-ux.md](principios-ux.md).

---

## 1. Requisitos Funcionais — RF

Descrevem **o que o sistema deve fazer**.

| ID   | Nome                  | Descrição |
| ---- | --------------------- | --------- |
| RF01 | Cadastro              | O sistema deverá permitir o cadastro de passageiros e motoristas. |
| RF02 | Autenticação          | O sistema deverá permitir autenticação e recuperação de acesso. |
| RF03 | Solicitação de corrida| O sistema deverá permitir que o passageiro informe origem e destino e solicite uma corrida. |
| RF04 | Matching              | O sistema deverá localizar e disponibilizar solicitações para motoristas elegíveis. |
| RF05 | Aceite                | O sistema deverá permitir que um motorista aceite ou recuse uma solicitação. |
| RF06 | Localização           | O sistema deverá transmitir a localização do motorista durante os estados aplicáveis da corrida. |
| RF07 | Roteamento            | O sistema deverá calcular rotas, distância e estimativa de duração. |
| RF08 | Pagamento             | O sistema deverá processar o pagamento da corrida. |
| RF09 | Histórico             | O sistema deverá armazenar e disponibilizar o histórico de viagens. |
| RF10 | Avaliação             | O sistema deverá permitir avaliação entre passageiro e motorista. |
| RF11 | Hub                   | O sistema deverá permitir acesso ao OpenDriverHub utilizando autenticação compartilhada. |
| RF12 | Motorista             | O sistema deverá permitir cadastro, validação e gerenciamento do motorista. |
| RF13 | Veículo               | O sistema deverá permitir cadastro e gerenciamento do veículo. |
| RF14 | Pix                   | O sistema deverá permitir cadastro de chave Pix para recebimento. |
| RF15 | Segurança             | O sistema deverá disponibilizar recursos de segurança durante a viagem. |
| RF16 | Gravação              | O sistema deverá permitir gravação de áudio conforme as regras de consentimento, privacidade e retenção definidas pelo produto. |
| RF17 | Administração         | O sistema deverá disponibilizar ferramentas administrativas para usuários, motoristas, viagens, pagamentos, configurações e métricas. |

---

## 2. Requisitos de UX — UX

Descrevem **como o sistema deve permitir que o usuário realize suas tarefas**.

| ID   | Nome                    | Descrição |
| ---- | ----------------------- | --------- |
| UX01 | Baixa carga cognitiva   | O aplicativo deverá minimizar a quantidade de informações e decisões apresentadas simultaneamente. |
| UX02 | Ações principais        | As ações de maior frequência deverão estar disponíveis com poucos toques. |
| UX03 | Solicitação de corrida  | O passageiro deverá conseguir solicitar uma corrida com um fluxo curto: `Origem → Destino → Confirmar`. |
| UX04 | Pagamento               | Quando existir um método de pagamento válido previamente configurado, o sistema deverá evitar etapas desnecessárias de seleção e confirmação. |
| UX05 | Hub                     | O acesso ao Hub deverá exigir uma única ação principal e não deverá solicitar novo login. |
| UX06 | Motorista               | Durante a operação, o motorista deverá receber apenas as informações necessárias para executar a próxima ação. |
| UX07 | Ações contextuais       | O aplicativo deverá apresentar somente as ações válidas para o estado atual da corrida. |
| UX08 | Informações progressivas| Informações detalhadas deverão permanecer disponíveis, mas inicialmente ocultas quando não forem necessárias para a tarefa principal. |
| UX09 | Redução de digitação    | Sempre que possível, o aplicativo deverá utilizar informações previamente cadastradas, localização, histórico e valores padrão. |
| UX10 | Feedback                | Toda ação importante deverá fornecer feedback visual, sonoro ou háptico adequado. |
| UX11 | Erros                   | Mensagens de erro deverão explicar o problema em linguagem simples e apresentar uma ação clara para resolução. |
| UX12 | Consistência            | A mesma ação deverá possuir comportamento e nomenclatura consistentes em todo o aplicativo. |
| UX13 | Segurança               | Recursos de segurança deverão ser acessíveis rapidamente durante uma viagem, sem comprometer a simplicidade do fluxo principal. |
| UX14 | Estados da corrida      | A interface deverá refletir claramente o estado atual da corrida, evitando apresentar ações inválidas ou desnecessárias. |

---

## 3. Critério de validação

- Os **requisitos funcionais** são validados verificando se a funcionalidade **existe e funciona corretamente**.
- Os **requisitos de UX** são validados verificando se a funcionalidade pode ser executada com **baixa fricção, baixa carga cognitiva e quantidade adequada de interações**.

Exemplo:

- **RF:** o passageiro consegue solicitar uma corrida.
- **UX:** o passageiro consegue solicitar a corrida sem navegar por múltiplas telas ou configurar novamente informações já conhecidas pelo sistema.

> **RF define o comportamento do sistema.**
>
> **UX define a qualidade da interação com esse comportamento.**
