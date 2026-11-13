# Pix exclusivo para visitantes — plano para aprovação

## Estado e autorização

**08/11/2026 — planejamento somente.** Dono autorizou pesquisar primeiro a InfinitePay, preparar consulta técnica se não houver suporte documentado e aguardar confirmação oficial antes de implementar. Sem código, credenciais, dados remotos, testes financeiros reais, commit/push ou deploy nesta etapa. A consulta foi preparada em arquivo, **não enviada**.

Repositório conferido: branch `feature/infinitepay-customer-auth`, HEAD `65974d50`, código publicado `c2a387e4`, worktree DEV `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. As duas alterações documentais locais da investigação anterior foram preservadas. Não reiniciar Fase 10 nem refazer os 261 testes da entrega anterior.

## Conclusão da pesquisa oficial

| Fonte oficial consultada em 08/11 | Evidência delimitada | Consequência para esta missão |
|---|---|---|
| [Checkout — documentação técnica](https://www.infinitepay.io/checkout-documentacao), seções sobre métodos, API Pix e sandbox | Cartão não pode ser desligado nesse checkout; não fornece API de QR/copia-e-cola. Não há sandbox documentado nesse produto. | O fluxo `/links` existente não comprova Pix exclusivo; não executar o botão de teste do site. |
| [Central de Ajuda — Checkout Integrado](https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay), `payment_methods_enabled` | Confirma cartão sempre disponível nesse contrato. | A presença de `pix` em options não habilita o requisito. |
| [Portal oficial de desenvolvedores](https://www.infinitepay.io/desenvolvedores) | Apresenta Checkout Integrado e InfiniteTap; este último é presencial por aproximação. | Não encontrei ali contrato de cobrança Pix exclusiva para navegador de visitante. |
| [Guia oficial de QR Code Pix](https://www.infinitepay.io/blog/gerar-qr-code-pix) | Descreve cobranças/QR em produtos da InfinitePay, incluindo aplicativo. | Existência de QR no app não demonstra API server-side de criação, consulta e correlação por pedido. |

**Resultado:** não foi encontrado um contrato público Pix-only compatível nas fontes oficiais examinadas. Isso não prova inexistência de algum produto com acesso restrito; essa possibilidade deve ser respondida pela CloudWalk com documentação. Não usar URLs de produtos homônimos, endpoints internos do App/Conta Web, scraping, interceptação do checkout, QR montado por conta própria ou campos presumidos.

O retorno formal CloudWalk de 06/11 já arquivado descreve `/links` e `/payment_check` e anuncia uma API granular futura. Anúncio/beta futuro não é disponibilidade atual. A pesquisa desta etapa não contradiz os aceites financeiros anteriores: identifica uma capacidade adicional ainda não confirmada.

## Arquitetura atual que deve ser preservada

| Componente existente | Papel verificado | Reuso ou limite do plano |
|---|---|---|
| `functions/checkout-identity.js`: `createCheckoutIdentity` | Contexto aleatório persistido, loja, modo e revisão; validade temporal. | Guest continua sem UID/Customer proprietário. Não deduzir propriedade do telefone digitado. |
| `functions/index.js`: `/checkout/identity` | Seleção explícita, resolução Strong pelo backend e limite existente por IP. | Reutilizar a identificação por sessão; auditar também os limites de criação de novas cobranças, pois rate limit de emissão de contexto não prova proteção completa contra abuso de múltiplas compras. |
| `functions/index.js`: `/checkout/confirmar` | Dados do visitante, preço/frete/desconto/fulfillment/estoque server-side, fingerprint e chave idempotente; cria pedido/pagamento pendentes. | Preservar o cálculo e a transação; definir a menor extensão apenas após conhecer o contrato Pix. |
| `functions/checkout-payment.js`: `InfinitePayProvider.create/check`, `start`, `reconcile` | POST `/links`, POST `/payment_check`, merchant persistido e validação de referências/valor, receipt e reserva. | **Strong e Phone continuam neste caminho.** Não alterar seus payloads, flags, permissões ou confirmações por causa do Guest Pix. |
| `functions/checkout-payment-access.js`: `assertOnlinePaymentAccess` | Bloqueia nova cobrança online Guest sem garantia de Pix exclusivo. | Manter a guarda até existir implementação efetiva e testes; não removê-la apenas para exibir opção ativa. |
| `functions/payment-return-auth.js` | Capability limitada ao pagamento, distinta de Auth/Customer. | Reutilização é candidata, condicionada ao contrato; nunca expor histórico por telefone. |
| `functions/payment-verification.js`, `checkout-reservation.js` e conciliação | Limites/lease de consulta, idempotência, estados de reserva e pagamento tardio/pendência. | Reutilizar invariantes; verificar compatibilidade do identificador e do protocolo Pix antes de compartilhar estruturas. |
| `crm/public/checkout-payment-choice.mjs`, `cardapio.html` e aliases | Opções por modo, finalização, carrinho, retry e frete já corrigidos. | Depois de aprovada a implementação real, mudar somente o ramo Guest para **Pix online / Combinar Pagamento**. Aliases seguem o sincronizador; sem cópias independentes. |

Não há adaptador de API Pix exclusiva implementado nesse fluxo. Nenhum endpoint, header, campo de payload ou credencial de um eventual produto Pix novo está sendo definido como real neste plano.

## Plano com gates objetivos

| Etapa | Trabalho | Evidência exigida para avançar |
|---|---|---|
| 1 — Consulta técnica | Encaminhar pelo titular o [texto preparado](INFINITEPAY_PIX_ONLY_TECHNICAL_QUERY.md), preferencialmente na conversa com o suporte já existente. | Resposta oficial e documentação do produto efetivamente disponível. Não enviar automaticamente nesta tarefa. |
| 2 — Decisão de viabilidade | Verificar se a exclusão de cartão é imposta pelo servidor do provider e se há criação + consulta confiável por referência. Comparar contrato com sessão Guest, loja e reserva atuais. | Matriz de compatibilidade atualizada. Se não houver suporte, registrar impedimento e parar; escolher outro provider exige nova decisão do Dono. |
| 3 — Escopo mínimo para aprovação | Identificar arquivos/funções realmente afetados e contrato de persistência do novo fluxo, sem alterar IDs históricos. Separar seleção de modo da autorização financeira. | Plano de patch revisável pelo Dono **antes** de alterar código. Se for outro produto, distinguir fluxo/merchant/referências nos novos pagamentos; registros antigos mantêm interpretação atual. |
| 4 — Credenciais e ambiente | Documentar provisionamento, escopos, merchant/loja, armazenamento backend, rotação e teste. | Aprovação específica antes de criar/ler/provisionar credenciais ou alterar configuração remota. Nunca reutilizar chave global/fallback de outra loja. |
| 5 — Implementação local | Adaptador Pix restrito ao Guest, mantendo caminho autenticado intacto e reaproveitando contratos comprovadamente compatíveis. | Testes sintéticos/emuladores abaixo PASS e revisão do Dono. Não criar endpoint ou retorno fictício para demonstrar Pix-only. |
| 6 — Publicação e homologação | Após autorização, API + Hosting DEV necessários, artefatos verificados e revisão da UI. | Aceite com ambiente oficial de teste se existir. Se não houver, qualquer criação/cobrança real depende de autorização específica prévia. Teste com mock não homologa o provider. |

Até o gate 2, o status é **AGUARDANDO CONFIRMAÇÃO OFICIAL**. Não há prazo ou estimativa de implementação confiável antes do contrato. Este plano não inicia Mercado Pago nem qualquer outro provider.

## Requisitos ainda desconhecidos do eventual fluxo Pix

| Dependência | O que deve ser confirmado | Impacto se diferir do checkout atual |
|---|---|---|
| Produto/API | Disponível hoje? Endpoint/base oficial, métodos, versão, limites e credenciamento. | Novo adaptador ou inviabilidade; não usar serviço anunciado para o futuro. |
| Restrição real | Como garantir Pix e impedir cartão inclusive na página hospedada? | Sem garantia, Guest online continua bloqueado. |
| Credencial | Mesma chave `inchk_` ou outra autenticação? Escopos, conta recebedora e isolamento por loja. | Configuração privada/secret ref específica, somente backend; não provisionar agora. |
| Dados do pagador | Nome/telefone/e-mail/CPF obrigatórios? Há OTP/cadastro no provider? | Avaliar minimização de dados e UX; não converter verificação do provider em Auth do CRM. |
| Identificação | Referência externa, identificador único da cobrança e da transação, moeda, valor, merchant e idempotência. | Correlacionar exatamente um pedido/loja; namespace não pode colidir com receipts de outros fluxos. |
| Confirmação | Consulta server-side autenticada? `/payment_check` aplica-se formalmente a esse produto? Webhook assinado? | Sem evidência financeira verificável, não automatizar PAID. Retorno do browser é apenas indicação. |
| Estados e tempo | Pendente, aprovado, falha, cancelamento, expiração, pagamento após expiração e refund parcial/integral. | Mapear sem presumir equivalência; reserva local não é cancelamento financeiro. Pagamento tardio vai para conciliação conforme contrato, sem confirmar outra compra. |
| Sandbox/ensaios | Credenciais de teste e simuladores de eventos? Criação já é cobrança real? | Definir prova de integração possível sem violar a restrição de operação real. |

## Riscos e controles mínimos propostos

| Risco | Classificação | Controle/gate |
|---|---|---|
| Prometer Pix-only e provider oferecer cartão | Bloqueador | Contrato explícito + verificação de que a restrição vale server-side. |
| POST/redirect forjado marcar pagamento | Alto | Confirmar pelo canal oficial confiável do produto, conferindo valor/moeda/merchant/referência e método Pix; manter estado pendente ou revisão na dúvida. |
| Timeout criar segunda cobrança | Alto | Persistir intenção idempotente; não repetir criação ambígua sem mecanismo oficial de recuperação/consulta. |
| Merchant/chave de loja diferente | Alto | Resolver por storeId validado, persistir o recebedor/fluxo da intenção e falhar sem configuração exata. |
| Expiração local e pagamento tardio | Alto | Separar os relógios/estados; idempotência na reserva/ledger e conciliação de pagamento tardio. Não inventar cancelamento no provider. |
| Apropriação cadastral por telefone | Alto | Guest usa snapshot informado; nenhuma vinculação automática a Customer, alias, endereço salvo ou histórico. |
| Abuso de cobranças sem login | Alto | Reavaliar limites de criação por loja/contexto/IP e proteção do provider; reutilizar o que existir e apresentar qualquer lacuna antes de expandir escopo. |
| Regressão do checkout homologado | Alto | Ramo Guest separado e testes Strong Google/password/Phone; históricos e links antigos inalterados. |

## Matriz de testes a preparar após o contrato e a aprovação

1. Guest sem Auth seleciona Pix e Combinar; login ausente nessa etapa. Strong e Phone mantêm Pix/cartão.
2. Geração Pix usa somente valor final calculado pelo backend e merchant da loja; método diferente de Pix não é autorizado.
3. Preço, frete, cupom, status, merchant, modo e campos de provider forjados não ampliam permissão.
4. Dados mínimos/telefone inválidos não geram pedido/reserva/cobrança; correção permite retry sem bloqueio permanente.
5. Pendente permanece pendente diante de browser/webhook forjado, divergência de valor ou confirmação inconclusiva.
6. Confirmação legítima Pix atualiza exatamente um pedido, receipt, estoque/cupom/financeiro.
7. Duplo clique, retry, duas chamadas simultâneas e timeout não duplicam compra/cobrança; erro ambíguo pede conciliação.
8. Outra loja, outro contexto, revisão vencida, outro merchant ou capability não acessam nem confirmam esse pagamento.
9. Eventos duplicados/fora de ordem/desconhecidos e falhas de consulta não provocam confirmação falsa ou rollback financeiro indevido.
10. Expiração local/provider, browser fechado e pagamento tardio seguem estados documentados; não equiparar fechar página a cancelamento financeiro.
11. Telefone de Customer existente não concede histórico nem gera cadastro duplicado; dados originais preservados.
12. Combinar não chama provider, não marca PAID, não perde a finalização/retry/frete já corrigidos. WhatsApp segue as regras existentes, com mocks somente.
13. Regressão de Google/e-mail/celular, links/receipts históricos, `/payment_check`, conciliação e callbacks antigos.
14. UI 1920×889/390×800; build, lint e diff-check; hashes do artefato DEV; retorno e refresh sem perda de origem/loja.

São critérios **futuros**, não resultados executados nesta etapa documental. As evidências de 261 testes do release `c2a387e4` continuam válidas para o comportamento que testaram; não demonstram Pix-only. Não é necessário repetir build/testes de runtime sem alteração de código.

## Entrega e limite da etapa

Pesquisa e plano concluídos; [consulta técnica pronta, não enviada](INFINITEPAY_PIX_ONLY_TECHNICAL_QUERY.md). Aguardar resposta oficial, atualizar a matriz e apresentar a menor proposta de patch ao Dono. Até lá, manter `c2a387e4` publicado e checkout autenticado preservado. Sem nova implementação, commit/push/deploy, credencial, cobrança, WhatsApp ou acesso PROD.

**Fase 9 100%; Fase 10 87,50%; global formal 97,00%; Fase 13 0%; PROD READY NÃO.** Planejamento não aumenta progresso formal.
