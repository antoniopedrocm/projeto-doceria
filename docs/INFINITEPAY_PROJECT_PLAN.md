# Autenticação de clientes e pagamento online

## Fase 0 — baseline e levantamento (2026-09-08)

- Repositório de trabalho: DEV, `https://github.com/antoniopedrocm/projeto-doceria.git`.
- Workspace original: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`; alterações preexistentes preservadas. Trabalho isolado em `infinitepay-auth-worktree`, dentro desse diretório.
- Branch exclusiva: `feature/infinitepay-customer-auth`. Placeholder remoto verificado em `2df755a1a08ee2e2467fa90b1525d07c881b2ab0`, idêntico a `origin/main`, sem commits próprios.
- Baseline: `production/main`, commit `7751ab46ae63d8cec91b6cd621dac6891a7052d4`, obtido do GitHub Multilojas por fetch. Referência escolhida conforme escopo; não houve verificação de equivalência com o bundle publicado.
- Comparação objetiva: 114 commits exclusivos de DEV e 441 de produção; diferença de 80 arquivos, 23.717 inserções e 9.552 remoções. Históricos divergentes: usar o snapshot de produção, sem merge das mains.
- Publicar somente esta feature no origin DEV, com lease fixado no SHA do placeholder se necessário. Nenhuma alteração nas mains ou no diretório de produção.
- Na execução inicial: somente preparação Git e este documento, commit `c85f57c5`, enviado ao DEV. Sem implementação ou deploy naquela execução.

## Estado preservado e direcionamento vigente — 2026-09-12

Esta atualização altera somente o planejamento. Substitui as decisões anteriores incompatíveis sem descartar código, recriar branch, reverter commits ou implementar fases futuras.

- Estado Git conferido: branch `feature/infinitepay-customer-auth`; último commit do projeto `c85f57c5`, sobre a baseline `7751ab46`. Existem alterações locais de interface, conta, regras, emulação e pagamento ainda não commitadas; todas preservadas.
- Fase atual: implementação parcial e validação local, com reconciliação do desenho de autenticação/Customer (fases 2–4 abaixo). Há trabalho antecipado nas fases 5, 7–9 e 11; isso não significa que estejam concluídas ou homologadas. E-mail/senha e login do cliente pela home ainda não foram implementados.
- Validação anterior registrada: 5 testes unitários de autenticação/pagamento, 4 testes transacionais nos emuladores, 3 testes HTTP do checkout, 30 testes de negócio existentes e 32 testes existentes de regras/caixa passaram nas respectivas execuções. Essas evidências antecedem este direcionamento; não validam os novos fluxos de e-mail ou telefone sem OTP. A validação visual completa permanece pendente.
- Na última tentativa, o seed de dados fictícios foi bloqueado pelo revisor automático por limite de uso. O script foi salvo, mas essa tentativa de execução não foi concluída. Não houve cobrança real nem deploy.
- Próxima tarefa da fase atual: adaptar o rascunho Google/Customer para telefone de contato obrigatório sem OTP, sem consultar/vincular automaticamente o Customer legado, preservando a identificação antiga por celular. Fazer isso em uma execução de implementação, com testes; nesta atualização, somente registrar a mudança.

### Divergências do rascunho a resolver, sem apagar o trabalho

| Componente existente | Ajuste pendente conforme o novo direcionamento |
| --- | --- |
| `crm/public/customer-account.js` e `functions/checkout-auth.js` | O rascunho exige SMS antes de resolver/criar o Customer Google. Retirar essa exigência do primeiro acesso na próxima implementação; OTP fica reservado à recuperação opcional de histórico, na fase 10, quando explicitamente solicitada |
| `functions/index.js`, consulta legada | O rascunho redireciona cadastros vinculados para Google. Reconciliar a experiência legada sem adicionar etapas e sem expor dados exclusivos da conta autenticada |
| `crm/public/checkout-payment-client.js` e endpoint de checkout | O rascunho admite pagamento online com sessão anônima. Isso não constitui decisão aprovada sobre visitantes: não habilitar esse caminho em homologação/publicação até definição futura. Identificação legada não concede os benefícios de uma conta autenticada |
| `crm/public/cardapio-*.html` e módulo de sessão | Preservar carrinho e contexto; futuramente pular identificação para cliente já autenticado. Novo botão de e-mail e ajuste de rótulo Google pertencem à fase de interface, não a esta atualização documental |

### Componentes adicionados durante a implementação local

- Conta compartilhada: `crm/public/customer-account.js`; backend `functions/checkout-auth.js`; callables conectadas em `functions/index.js`.
- Pagamento: `functions/checkout-payment.js`, `crm/public/checkout-payment-client.js`, `crm/public/payment-return.html` e `payment-return.js`; endpoint de confirmação/webhook/status em `functions/index.js`.
- Ambiente local: `crm/public/checkout-environment.js`, `firebase.checkout-local.json`, `scripts/checkout-seed.cjs`; projeto demo `demo-doceria-checkout`, distinto do Firebase DEV.
- Testes: `functions/checkout-auth.test.js`, `checkout-payment.test.js`, `checkout-emulator.test.js` e `checkout-http.test.js`; regras em `firestore.rules` e índice de histórico em `firestore.indexes.json`.
- Configuração por loja: `docs/INFINITEPAY_STORE_CONFIG.example.json`. Matriz: tag `ana_guimare`, conforme última confirmação do usuário. Demais contas aguardam suas tags; nenhuma loja deve herdar automaticamente a conta da Matriz. `cardapio-festa.html` usa a loja Matriz na baseline, não representa por si só uma terceira conta de recebimento.
- Scripts temporários `.checkout-*.cjs`, `.audit-read.cjs` e manifesto local `functions/functions.yaml` estão preservados no worktree; revisar os artefatos de desenvolvimento antes de futuros commits/deploys, sem tratá-los como produto concluído.

## Mapa direcionado da baseline (levantamento histórico)

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
- A baseline contém configuração pública e API_BASE_URL de produção e scripts Functions com `--project ana-guimaraes`. O trabalho local posterior iniciou o isolamento do checkout e ajustes nos scripts. Conferir também as configurações do CRM antes de qualquer execução/build; não presumir isolamento completo apenas pelo checkout.
- Projeto Firebase permitido para futuro DEV: `crmdoceria-9959e`. Produção: `ana-guimaraes`, somente no diretório próprio e após homologação/autorização. Confirmar caminho absoluto antes de qualquer build/deploy. Fluxo obrigatório LOCAL → DEV → PRODUÇÃO; sem deploy automático.
- Testes e aplicação não foram executados na auditoria inicial. As verificações posteriores estão registradas acima, sem equivaler a homologação ponta a ponta. Nenhum conteúdo sensível deve ser registrado no plano ou commits futuros.

## Arquitetura e experiência aprovadas

### Identificação e sessão

- Interface futura: **Continuar com celular**; **G Entrar com Google** e **✉ Entrar com e-mail** lado a lado (empilháveis em telas pequenas); separador **ou**; **Continuar como visitante**; **Cancelar**. Escopo de autenticação real: `GOOGLE` e `EMAIL_PASSWORD`, sem outros providers nesta etapa.
- **Celular é acesso legado/identificação por telefone**, não autenticação forte: informar telefone → buscar cadastro → comportamento atual → endereço/retirada. Manter exatamente essa experiência, sem OTP, SMS, WhatsApp de validação, código, Firebase Phone Authentication, senha ou etapa adicional. Isso não elimina os usos de contato/WhatsApp já existentes no pedido.
- O acesso legado não deverá liberar cartão salvo, conta autenticada completa, gestão de credenciais/identidades, recuperação de dados sensíveis adicionais ou pagamentos que exijam conta autenticada. Preservar a experiência atual não autoriza ampliar seus privilégios.
- **Google é autenticação real** pelo Firebase. No primeiro acesso, pedir apenas o telefone de contato se faltar; não exigir validação do número nem usar a coincidência para recuperar dados antigos.
- **E-mail/senha é autenticação real** pelo Firebase: entrada com e-mail e senha, “Esqueci minha senha” e “Criar conta”. Cadastro: nome, e-mail, telefone, senha e confirmação de senha. Autenticar imediatamente após criar a conta e retomar a mesma etapa do checkout, sem código ou confirmação obrigatória antes da compra.
- E-mail não verificado não bloqueia cadastro, login inicial, compra, pagamento online ou área básica. Planejar envio nativo de verificação do Firebase em segundo plano após cadastro, se compatível; falha no envio não interrompe a compra. Usar `emailVerified` do Firebase; permitir reenviar em Minha Conta e atualizar a indicação após validação. Não criar sistema próprio de código numérico por e-mail.
- Cliente também poderá entrar pela home, com **Área do Cliente** (Google/e-mail) separada de **Acesso da Equipe / Entrar como funcionário**. Preservar a autenticação da equipe e impedir privilégios administrativos a clientes.
- Sessão compartilhada do cliente entre home e cardápio, separada do contexto administrativo. Cliente já autenticado não vê novamente “Como deseja continuar?”: segue à próxima etapa adequada. Login/cadastro durante o checkout preserva carrinho, loja, cupom, entrega e etapa de retorno, inclusive em recarregamento/redirect.
- Visitante permanece disponível com a experiência atual. Pagamento online de visitante é decisão futura, nem permitido nem proibido por este plano; nunca haverá cartão persistente associado a uma conta Ana Guimarães nesse modo.

### Customer e identidades

- Modelo genérico: `CUSTOMER → AUTH_IDENTITIES (GOOGLE, EMAIL_PASSWORD) + ADDRESSES + ORDERS`. Customer tem identificador interno estável; usar Firebase UID ou abstração equivalente para o vínculo autenticado. Google usa o identificador imutável do provider (`sub`); e-mail/senha fica sob gestão do Firebase, nunca usando somente o texto do e-mail como chave primária do Customer.
- Preparar múltiplos métodos autenticados no mesmo Customer no futuro, sem implementar a associação nesta atualização. Não fazer vínculo entre contas por mera coincidência de e-mail, nome ou telefone; exigir prova adequada de controle das identidades quando essa fase chegar.
- Telefone obrigatório em contas Google e e-mail, usado para contato do pedido, entrega, WhatsApp e InfinitePay. Telefone informado não é telefone verificado: conceitualmente `phone_number` e `phone_verified_at = null` até comprovação. Ausência de verificação não bloqueia conta, nova compra, pagamento ou novo endereço.
- **Proibido merge/vínculo automático com cadastro legado por telefone.** Um usuário autenticado que informe número já cadastrado não recebe os endereços ou pedidos antigos. Manter Customer autenticado isolado do legado até recuperação segura; essa separação intencional substitui a antiga exigência de reutilizar imediatamente o cadastro telefônico. Garantir idempotência/unicidade pelo vínculo autenticado, não pelo telefone informado.
- Recuperação histórica é opcional e posterior: na área autenticada, oferecer confirmação de posse para recuperar cadastro anterior; somente após prova segura associar histórico/endereços. OTP por SMS ou WhatsApp poderá ser implementado exclusivamente nessa finalidade, na fase 10 mediante pedido explícito, nunca no botão de celular nem no cadastro inicial. Prever tratamento de conflitos e números reciclados sem associação insegura; não revelar dados históricos antes da prova.
- Minha Conta futura: Meus Dados, Meus Endereços, Meus Pedidos, Formas de Pagamento, Segurança da Conta e Sair. Mostrar e-mail verificado/não verificado e reenvio; telefone informado e recuperação opcional de histórico quando aplicável. Endereços e histórico pertencem à aplicação.

### Pagamentos e responsabilidades

- InfinitePay permanece o gateway: Pix, cartão, parcelamento quando suportado, customer, endereço, `order_nsu`, redirect, webhook e confirmação financeira server-side. Clientes autenticados por Google ou e-mail poderão pagar sem verificação inicial obrigatória de telefone/e-mail.
- Ana Guimarães mantém Customer, identidades, perfil, telefone, sessão, endereços, histórico, pedidos e status. InfinitePay mantém processamento financeiro, dados PCI e eventuais mecanismos seguros de cartão salvo. Confirmar o suporte efetivo a cartão salvo antes de implementar/promover essa opção; nunca armazenar número completo/PAN, CVV ou dados sensíveis PCI na aplicação.
- Preservar `PaymentService → InfinitePayProvider`, configuração por loja, idempotência, conciliação de pedido/conta/valor e confirmação pelo backend. Redirect não comprova pagamento; webhook precisa ser validado e reconciliado. Não liberar estoque/confirmar pedidos com base apenas no navegador.
- Separar `order_status`: PENDING, CONFIRMED, PREPARING, READY, DELIVERED, CANCELLED; e `payment_status`: PENDING, PAID, FAILED, EXPIRED, REFUNDED. Garantir compatibilidade com legado. Expiração, falha, estorno, reservas, cupons e notificações ainda exigem validação completa; os testes existentes não demonstram que todos esses estados foram implementados.

## Roadmap vigente (numeração atualizada)

A numeração abaixo substitui a antiga. Trabalho já iniciado permanece preservado; a atualização não autoriza executar automaticamente fases posteriores.

| Fase | Entrega e critério principal |
| --- | --- |
| 0 | Baseline Git e levantamento concluídos; ambiente local iniciado e testado parcialmente; preservar rastreabilidade e isolamento |
| 1 | Interface Google + e-mail + separador; preservar celular/visitante e acessibilidade. Rascunho Google existente; e-mail e novo rótulo pendentes |
| 2 | Google Auth + sessão pública. Rascunho existente; reconciliar primeiro acesso sem OTP e validar o fluxo |
| 3 | E-mail/senha: cadastro, login, logout, recuperação de senha e verificação nativa não bloqueante. Planejado |
| 4 | Customer autenticado: telefone obrigatório sem validação inicial; vínculo por identidade autenticada; nenhum merge automático com legado. Reconciliar o módulo já iniciado |
| 5 | Minha Conta: perfil, endereços, pedidos, formas de pagamento, segurança e verificação de e-mail. Parte iniciada, não homologada |
| 6 | Login do cliente pela home, separado da equipe; reaproveitar sessão e pular identificação no checkout. Planejado |
| 7 | Preparar pedidos/status para pagamento, compatibilidade legada, reservas/cupons e notificações. Parte iniciada |
| 8 | InfinitePay: checkout, Pix/cartão, customer/endereço, order_nsu e redirect por loja. Provider iniciado, sem validação financeira real; cartão salvo/parcelamento dependem do suporte efetivo |
| 9 | Webhook: validação, idempotência, reconciliação e confirmação server-side. Parte testada em emulação; completar cenários de recuperação |
| 10 | Recuperação opcional do legado mediante prova de posse do telefone; somente então associar histórico/endereços. Não implementar OTP agora |
| 11 | Testes locais completos: celular inalterado, Google/e-mail sem validação inicial, isolamento de Customer/legado e equipe, sessão home/checkout, endereços/histórico, pagamento e recuperação; preservar os testes já úteis e adaptar os incompatíveis |
| 12 | Firebase DEV `crmdoceria-9959e` e homologação após marco funcional local e autorização. Sem deploy nesta atualização |
| 13 | Produção após homologação e autorização, no repositório/diretório próprio, com plano de retorno. Sem promoção automática |

Esta atualização não altera código, schema, autenticação de funcionários, fluxo de visitante ou configuração Firebase; não faz deploy. Commit documental separado, somente na branch atual do GitHub DEV. As divergências do rascunho acima ficam explícitas para a próxima implementação, sem declarar o código já conforme ao novo plano.
