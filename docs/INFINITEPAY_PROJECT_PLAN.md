# Autenticação de clientes e pagamento online

## Fase 0 — baseline e levantamento (2026-09-08)

- Repositório de trabalho: DEV, `https://github.com/antoniopedrocm/projeto-doceria.git`.
- Workspace original: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`; alterações preexistentes preservadas. Trabalho isolado em `infinitepay-auth-worktree`, dentro desse diretório.
- Branch exclusiva: `feature/infinitepay-customer-auth`. Placeholder remoto verificado em `2df755a1a08ee2e2467fa90b1525d07c881b2ab0`, idêntico a `origin/main`, sem commits próprios.
- Baseline: `production/main`, commit `7751ab46ae63d8cec91b6cd621dac6891a7052d4`, obtido do GitHub Multilojas por fetch. Referência escolhida conforme escopo; não houve verificação de equivalência com o bundle publicado.
- Comparação objetiva: 114 commits exclusivos de DEV e 441 de produção; diferença de 80 arquivos, 23.717 inserções e 9.552 remoções. Históricos divergentes: usar o snapshot de produção, sem merge das mains.
- Publicar somente esta feature no origin DEV, com lease fixado no SHA do placeholder se necessário. Nenhuma alteração nas mains ou no diretório de produção.
- Nesta execução: somente preparação Git e este documento. Sem implementação, build, execução da aplicação ou deploy.

## Mapa direcionado da aplicação

Os caminhos abaixo são relativos ao worktree; linhas referem-se à baseline acima.

| Área | Arquivos e pontos de entrada |
| --- | --- |
| Cardápios públicos | `crm/public/cardapio-matriz.html`, `cardapio-garavelo.html`, `cardapio-festa.html` |
| Identificação e etapas | Nos três HTMLs: finalizar em 368; modal “Como deseja continuar?” em 376; celular/visitante em 380–382; identificação em 392; endereços em 444; pagamento em 553; confirmar em 587 |
| JavaScript do checkout | Módulo inline a partir de 1219; `handlePhoneSearch` por volta de 2860; `handleGuestOrder`, `handlePlatformOrder`, `finalizeOrder` até 3248 |
| Carrinho | Array `cart`, `renderCart`, totais e cupom nos HTMLs; `persistCheckoutState`, restauração e limpeza via `sessionStorage` (1500–1561) |
| Firebase público | `crm/public/firebaseClientConfig.js`: app nomeado `cardapioPublic`, Auth anônimo persistente, Firestore, Functions em `us-central1` e wrappers de consulta/perfil |
| Firebase CRM | `crm/src/firebaseConfig.js`; `crm/src/App.js` já contém login interno por senha e Google (aprox. 6743–6793). Não confundir identidade de funcionário com customer público |
| Backend | `functions/index.js`: Express exportado como `api` (2505), Admin SDK e Functions; Node 22 em `functions/package.json` |
| Customers | Coleção global `clientes` (1174); normalização/busca por telefone e upsert; POST `/clientes` (1452); callable `lookupClientByPhone` (2000), `updateClientProfile` (2081) |
| Endereços | Array `enderecos` no cliente; callable `addClientAddress` (2142); HTML monta endereço completo, apelido, coordenadas, referência, complemento, sem número e preferência (aprox. 2374) |
| Pedidos | POST `/checkout/confirmar` (1616); gravação transacional em `lojas/{lojaId}/pedidos/{pedidoId}` (1787), com clienteId/nome/endereço/telefone, itens, totais, formaPagamento, status, origem, createdAt |
| Pagamento atual | HTML envia apenas a forma selecionada; backend confirma criação do pedido, sem gateway nesse fluxo. Visitante também recebe envio via WhatsApp após salvar |
| Regras e índices | `firestore.rules`, `firestore.indexes.json`, `storage.rules`; revisar autorização de cliente e leitura de histórico antes da área Minha Conta |
| Hosting | `firebase.json`: publica `crm/build`, cleanUrls e fallback `/index.html`; front CRM React 18/CRA 5/Tailwind, cardápios HTML/JS com Firebase SDK 10.8 via CDN |
| Emuladores | PARCIAL: script `dev` na raiz e scripts em `functions/package.json`; testes de regras/integração em `functions/firestore.rules.test.js` e `caixa-functions.integration.test.js`. `firebase.json` não define seção emulators; inicializadores inspecionados não conectam Auth/Firestore/Functions aos emuladores |

### Comportamento e riscos a preservar no planejamento

- Matriz e festa são idênticos na baseline; garavelo difere somente em duas linhas de STORE_ID. Há forte duplicação. Preferir futuramente um módulo compartilhado de identificação/sessão, parametrizado por loja, com adaptação pequena nos HTMLs; sem refatoração ampla nesta fase.
- Celular atual é consulta cadastral: normaliza número, aplica rate limit/auditoria e retorna cliente; se não encontrado, abre cadastro. Não há OTP nesse fluxo. A sessão anônima não comprova propriedade do telefone ou customer.
- A callable de endereço inspecionada valida loja e cliente, mas não demonstra vínculo autenticado entre solicitante e customer. Antes de expor conta/histórico, revisar também endpoints de cadastro/perfil e regras; não usar clientId enviado pelo navegador como autorização.
- Customers são compartilhados entre lojas e possuem nome, telefone, endereços, lojasVisitadas, contadores de compras e timestamps conforme os handlers. Pedidos ficam por loja. Planejar histórico multiloja com autorização pelo customer estável.
- Checkout atual valida itens/totais e altera estoque/cupom na transação. A fase de pagamento deve decidir reserva, expiração, liberação de estoque/cupom e momento das notificações (`notifyNewOrder`, 3710), evitando anunciar como confirmado um pedido ainda não pago.
- A baseline contém configuração pública e API_BASE_URL de produção e scripts Functions com `--project ana-guimaraes`. Não executar esses scripts no DEV. Preparar configuração local isolada e conexões aos emuladores antes de abrir o checkout; definir emuladores de Auth, Firestore e Functions e dados fictícios. Nada disso foi alterado nesta execução.
- Projeto Firebase permitido para futuro DEV: `crmdoceria-9959e`. Produção: `ana-guimaraes`, somente no diretório próprio e após homologação/autorização. Confirmar caminho absoluto antes de qualquer build/deploy. Fluxo obrigatório LOCAL → DEV → PRODUÇÃO; sem deploy automático.
- Testes e aplicação não executados nesta auditoria documental; emulação ponta a ponta permanece pendente. Nenhum conteúdo sensível deve ser registrado no plano ou commits futuros.

## Próximas fases

| Fase | Entrega e critério principal |
| --- | --- |
| 0 | Baseline Git, levantamento e plano registrados; concluir isolamento local antes de testes funcionais |
| 1 | Adicionar visualmente “G Continuar com Google” e separador “ou”; sem autenticação, sem simular sessão; preservar celular e visitante |
| 2 | Google Auth e sessão pública; identidade por provider + `sub` estável verificado, nunca e-mail como chave; distinguir UID Firebase de sub Google |
| 3 | Vincular Google ao customer existente mediante telefone validado/OTP ou prova equivalente; modelo customer → auth identities (Google/phone); unicidade e transação para evitar duplicação; nunca merge por nome ou coincidência insegura |
| 4 | Minha Conta: perfil, endereços, histórico e logout; acesso server-side/regras pelo customer; prever seção Formas de Pagamento dependente do suporte do gateway |
| 5 | Separar order_status (PENDING, CONFIRMED, PREPARING, READY, DELIVERED, CANCELLED) de payment_status (PENDING, PAID, FAILED, EXPIRED, REFUNDED); pedido aguarda pagamento antes de confirmar; compatibilidade com pedidos antigos |
| 6 | PaymentService + InfinitePayProvider no backend; criação de checkout, Pix/cartão, customer/endereço, order_nsu e redirect; verificar documentação oficial vigente, parcelamento e suporte real a cartão salvo antes de prometer essas funções |
| 7 | Webhook: validação conforme contrato oficial, confirmação server-side, idempotência persistida, conciliação de valor/pedido/provedor e atualização atômica; retorno do navegador nunca comprova pagamento |
| 8 | Testes locais com dados fictícios: três cardápios, celular/visitante, Google, vínculo seguro, isolamento multiloja, endereços/histórico, pagamento pendente/pago/falha/expiração, webhook duplicado e fora de ordem, recuperação de estoque/cupom |
| 9 | Após marco funcional local, deploy Firebase DEV explicitamente autorizado e homologação em crmdoceria-9959e |
| 10 | Após homologação e autorização, promoção controlada para produção no repositório/diretório correspondente, com plano de retorno |

Custódia de cartão exclusivamente no provedor: nunca armazenar PAN, CVV ou dados sensíveis PCI. Cartão salvo somente por mecanismos seguros efetivamente suportados pela InfinitePay. Histórico e endereços pertencem à aplicação Ana Guimarães. Não implementar integração ou alterar schema nesta execução.
