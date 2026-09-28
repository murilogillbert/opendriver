# OpenDriver

Aplicativo de mobilidade (passageiro + motorista) integrado ao ecossistema OpenDriverHub.

## Documentação de referência

- [docs/requisitos.md](docs/requisitos.md) — Requisitos Funcionais (RF01–RF17) e de UX (UX01–UX14).
- [docs/principios-ux.md](docs/principios-ux.md) — Princípios de UX e interação que fundamentam os requisitos de UX.

## Regras para qualquer trabalho de interface

- Toda tela tem **uma ação dominante**: a que o usuário veio realizar. O resto é secundário, expansível ("Ver detalhes") ou vai para outra tela.
- Complexidade fica no backend. Use valores padrão (localização atual, último pagamento, categoria mais usada) em vez de pedir escolhas; opção única válida é selecionada automaticamente.
- Metas de interação: pedir corrida em 2–3 toques; Hub em 1 toque, sem novo login; pagamento com 0 interações quando há método válido; aceitar/iniciar/finalizar em 1 toque cada.
- Mostre apenas as ações válidas para o estado atual da corrida.
- Erros dizem o que aconteceu, o que fazer e oferecem uma ação — nunca códigos técnicos (ex.: "HTTP 402").
- Vocabulário fixo: Aceitar, Cancelar, Iniciar, Finalizar, Voltar — sempre com o mesmo significado.
- Ao especificar ou revisar uma funcionalidade, referencie os IDs RF/UX correspondentes.
