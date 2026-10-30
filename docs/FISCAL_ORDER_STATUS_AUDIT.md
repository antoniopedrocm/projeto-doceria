# Pedido pago ausente da fila fiscal — diagnóstico DEV

Ambiente: `crmdoceria-9959e`, worktree `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`. PROD não autorizada.

## Pedido identificado e leitura técnica

Pedido `e44896d85c33a815b9bd2a6d0f47fcfc762aff42fd97f0a30f9ec62e1c628268`, coleção `lojas/ana-guimaraes-doceria-matriz/pedidos`.

- createdAt: `2026-10-30T02:04:19.115Z` = **29/10/2026 23:04:19 UTC−3**; pertence ao filtro mensal de outubro.
- status operacional legado: **Pendente**; order_status **CONFIRMED**; payment_status **PAID**.
- paymentMode **ONLINE_NOW**; paymentMethod **PIX**; formaPagamento **Pix online**; requiresReview false; paymentId presente.
- approvedForInvoice ausente; sem status/documento fiscal associado.

Somente metadados necessários foram consultados; sem dados pessoais, cartão ou requisição ao provedor. O pedido real não foi atualizado.

## Filtro exato

O listener carrega `lojas/{storeId}/pedidos` sem filtro de paymentMethod/paymentMode. A fila em `App.js`, `invoiceableOrders`, aceita `status` em **Finalizado, Aprovado, ready_for_invoice, approved**, ou `approvedForInvoice` verdadeiro. Depois aplica data, situação fiscal e busca. O backend fiscal também exige esse estágio operacional.

Neste pedido, **Pendente** exclui o documento antes dos filtros de data/método. Confirmado/Pago na Área do Cliente não equivale a Finalizado/Aprovado no fluxo fiscal. Não foi criado atalho para emitir prematuramente. Pedidos AGREED_LATER sem método aparecem quando atingem o mesmo estágio; a seleção do meio fiscal permanece uma validação posterior.

## Bloqueio relatado ao editar o status

O usuário tentou alterar o status e recebeu a mensagem genérica de falta de permissão na loja. A investigação encontrou o fluxo de edição completa: `reloadOrderCriticalData` e `persistOrderWithTransaction` reconstroem os itens com os dados atuais dos produtos, inclusive produtoId/estoque/categoria, mesmo quando a intenção era mudar somente status. O item desse pedido não tem o campo estoque salvo, mas o catálogo atual tem. Essa reconstrução modifica **itens**, protegido pelas Rules de pedido pago.

As Rules publicadas no DEV foram lidas e são idênticas ao arquivo local: SHA-256 `eff946105e5423ba386aebbee4de1ff5c89eaaaca70f9d7a05bd504076307c5d`. O teste no emulador reproduziu a recusa ao adicionar os campos do catálogo no item e a aceitação de status isolado. Não se trata de autorização concedida pelo novo paymentMode; as proteções financeiras estavam funcionando.

## Correção limitada ao CRM

Pedidos com paymentId usam o formulário **Atualizar status do pedido**, sem campos financeiros editáveis. A transação relê o pedido, exige PAID/estado canônico permitido/sem revisão, confere a loja e o status esperado, e grava somente **status e updatedAt**, junto de log atômico com IDs e transição. O handler exige sessão Staff gravável, acesso ao módulo Pedidos e loja da visão atual. As Rules existentes continuam sendo a autorização de backend.

Não revalida catálogo/cliente, não reprecifica, não altera paymentMethod/payment_status/order_status, não baixa ou restitui estoque e não reutiliza cupom. Concorrência rejeita snapshot desatualizado; repetir a mesma transição é no-op sem log duplicado. A apresentação conserva o badge canônico e mostra separadamente o status operacional, quando diferente. Os pedidos manuais históricos continuam no fluxo existente.

Nenhuma API, Function, Rule, índice, Auth, payment_check, webhook, estoque, cupom ou integração InfinitePay foi alterada. Publicação necessária: somente Hosting DEV.

## Verificação

- 18 testes Node de seleção fiscal, método e transação; 4 testes do handler real extraído por AST.
- 28 testes de integração em emuladores: reprodução das Rules, atualização isolada, bloqueios Customer/Contador/anônimo, invariantes financeiras, AGREED_LATER e fluxo fiscal com provedor fictício.
- 49 testes React: badges e controles/handlers fiscais, autoridade de método online e seleção obrigatória offline.
- Nenhum pedido, pagamento, nota fiscal, SMS ou WhatsApp real foi criado; nenhum status do pedido real foi alterado para passar o teste.

Build PASS (avisos preexistentes de sourcemap/native-audio e metadados de navegadores); lint PASS, 65 avisos preexistentes de App.js sem aviso novo; diff-check PASS. [Evidência local](evidence/fiscal-order-status-local.json). Publicação e commit: registrar após a entrega. Aceite manual fiscal continua pendente. Não iniciar Mercado Pago antes do aceite.

Percentuais preservados: Fase 9 75%; Fases 11/12 100%; Global 95,00%; Fase 13 0%.
