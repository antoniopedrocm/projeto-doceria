# Escolha de pagamento autenticado V1 — DEV

Escopo: `feature/infinitepay-customer-auth`, workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, Firebase `crmdoceria-9959e`. PROD não autorizada. Mercado Pago permanece futuro. Percentuais formais inalterados: Fase 9 75%, Fase 11/12 100%, Global 95,00%, Fase 13 0%.

## Escolha e método são conceitos separados

| Escolha STRONG_AUTH | paymentMode | paymentMethod inicial | Estado de pagamento inicial | Fluxo |
| --- | --- | --- | --- | --- |
| Pagar Agora — Pix ou Cartão (padrão) | ONLINE_NOW | null | PENDING | Provedor online configurado da loja, hoje InfinitePay |
| Combinar Pagamento | AGREED_LATER | null | PENDING | Pedido offline, sem link/cobrança online |

`formaPagamento` permanece como rótulo compatível (`Online` / `A combinar`), não como confirmação de um método real. AGREED_LATER usa `paymentStatus`; ONLINE_NOW conserva `payment_status` do contrato financeiro existente, sem duplicar estado em dois campos. Esse campo legado e os demais campos reservados online continuam exclusivos desse fluxo. Gravá-los em um pedido offline impediria as atualizações Staff pelas Rules já existentes; nenhuma Rule foi ampliada.

O backend valida modo/forma, token de contexto STRONG_AUTH, UID canônico, Customer e loja. Guest e LEGACY_PHONE conservam suas opções/contrato existentes; não ganham acesso ao fluxo autenticado pelo conhecimento do telefone ou por grant SMS. A escolha online continua passando pela configuração atual da loja, sem novo vínculo conceitual PAY_NOW = InfinitePay.

## Criação, estoque e financeiro

- ONLINE_NOW conserva reserva, confirmação server-side, reconciliação, validação de valores, expiração, cupom e checkout existente. Após confirmação, `paymentMethod` recebe PIX/CREDIT_CARD e `paymentMethodSource=provider/infinitepay`. O `captureMethod` verificado fica no documento financeiro privado. Não foi alterada a chamada `payment_check`, webhook ou política de sinais.
- AGREED_LATER cria pedido `Pendente`, com método null e pagamento pendente. Segue a baixa de estoque e o consumo de cupom do fluxo offline existente; não cria checkoutPayments, reserva online ou recebimento pago. Definir método fiscal não liquida o financeiro.
- Ambas as escolhas V1 usam chave idempotente por UID/loja e fingerprint transacional, sem duplicar pedido, estoque ou cupom em reenvio concorrente. Reutilizar a chave com outra escolha/dados é recusado. O botão Confirmar Pedido também bloqueia execução simultânea.
- Consentimento e texto do WhatsApp permanecem iguais. Os testes não enviam mensagens.

## Nota fiscal

Na aba Emitir, pedido AGREED_LATER sem método apresenta select obrigatório “Forma de pagamento”, usando `ORDER_PAYMENT_OPTIONS` já existente. A seleção é persistida somente ao usar **Salvar e Validar**, por `fiscalResolveOrderPaymentMethod`; checar requisitos não faz essa gravação.

O callable exige a autorização fiscal Staff e o escopo de loja atuais, recusa Customer/outro escopo, método inválido, pedido online/associado a provedor, método já resolvido diferente e emissão em andamento/nota autorizada. Persiste método real, código fiscal existente, rótulo, `paymentMethodSource=invoice/manual`, data e UID. Auditoria `ORDER_PAYMENT_METHOD_RESOLVED` em `auditLogs` contém IDs/método/código, sem telefone/endereço/email. Não altera paymentStatus, estoque, cupom ou recebimentos. Se um recebimento offline já tiver sido registrado separadamente, a seleção do método conserva esse estado.

Mappings reutilizados: dinheiro 01, crédito 03, débito 04, Pix dinâmico/link gerado 17, Pix fixo/QR fixo/Pix genérico 20. Nenhum código fiscal novo. O texto genérico Pix conserva o mapping já existente; o Pix confirmado pela InfinitePay usa o mapping dinâmico 17.

O servidor bloqueia validação/emissão de AGREED_LATER indefinido, inclusive chamada direta e rascunho antigo. ONLINE_NOW aguarda método confirmado. Para pagamento online, a preparação lê `checkoutPayments` privado e valida vínculo com pedido/loja e estado; a fonte é o captureMethod verificado. Para registros pagos anteriores sem esse campo, usa o rótulo online protegido já persistido. Campos manuais do browser não substituem essa autoridade. A reserva fiscal reconfere o estado para evitar alteração durante a validação. Notas históricas não são regravadas.

## Base fiscal efetivamente publicada

A auditoria encontrou divergência da branch: App.js já chama fiscalSaveDraft/fiscalCheckDraft/fiscalIssueDraft, ausentes de seu fiscal.js. As três funções DEV estavam ativas, e seu fonte foi lido pela API Cloud Functions/GCS, sem emissão nem acesso a dados de cartão. O código normalizado corresponde ao Git `3a116fa2`, blob fiscal `b60268c62a3cd9a623fbc68a8f46b9130656f766`.

Foram recuperados esse fiscal.js e suas dependências fiscal-core/fiscal-clone e testes/fixture, mantendo o fluxo de rascunho/clonagem em uso. fast-xml-parser 5.7.3 já fazia parte desse runtime; foi explicitado no package/lock da branch. Isso explica o diff fiscal maior que a nova regra. Não é uma implementação nova de clonagem.

A comparação por AST de 15 blocos por função ativa (IssueDraft, CheckDraft, IssueInvoice e ValidateOrder) confirmou que as diferenças nos caminhos usados por esta entrega se limitam à preparação/resolução/reconferência de pagamento. Autorização, issuer/settings/certificado, serviço fiscal e handlers antigos foram comparados com o fonte de cada função, não presumidos iguais por versão. Os demais exports fiscais e suas configurações publicadas não fazem parte do deploy desta tarefa. Antes de qualquer deploy fiscal amplo futuro, reconciliar explicitamente os demais exports/configuração central da branch com suas revisões ativas.

## Validação e publicação

Testes usam dados fictícios e provedores/serviço fiscal simulados. Auth/Firestore são locais em projeto demo. Incluem escolhas/default/helper, retorno ao contrato Guest/Phone, autorização, idempotência, estoque/cupom, financeiro, mappings, bloqueio fiscal, prioridade do provedor, históricos e clonagem.

Publicação limitada a Hosting e funções necessárias no DEV. Não publicar Rules, índices, triggers de estoque/WhatsApp ou schedulers. Preservar env vars de aplicação de cada função; nunca incluir valores na evidência. Verificar hashes do Hosting e fonte/revisões das funções após deploy.

Aceite manual pendente após publicação: alternar as duas opções autenticadas e conferir helper/padrão sem confirmar compra/pagamento; conferir select fiscal em pedido a combinar elegível, caso disponível, sem emitir nota real. A execução dos fluxos financeiros/fiscais já é coberta por mocks/emuladores. Não enviar SMS/WhatsApp nem iniciar Mercado Pago.
