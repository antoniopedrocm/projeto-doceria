# Eventos e conciliação InfinitePay V1 — DEV

Contrato de origem: [resposta formal do suporte de 25/10/2026](INFINITEPAY_SUPPORT_CONTRACT_2026-10-25.md). Implementação da missão pré-PROD em 01/11. A integração não executa cancelamento ou refund na InfinitePay; o provider não fornece a consulta autenticada desses dois resultados neste contrato.

## Autoridade e transições

| event_type | Tratamento | Efeito financeiro/operacional |
|---|---|---|
| paid | payment_check no backend com merchant persistido, order_nsu, transaction_nsu e slug | Valor/método/referências/pedido/reserva compatíveis: PAID, HELD→CONSUMED, cupom/receipt uma vez |
| payment_failed | Registrar tentativa; consultar payment_check quando referências completas | paid:false não é cancelamento do pedido. Mantém possibilidade de nova tentativa; nunca regride PAID |
| created | Registro informativo não verificado | Nenhum consumo/liberação/recebimento |
| settled | Notificação informativa não verificada | Não confirma pedido, não consome estoque/cupom, não gera WhatsApp/receipt |
| canceled | Buscar CANCEL_EXPECTED com execução externa registrada por Staff autorizado | Compatível e ainda PENDING: CANCELLED, libera somente reserva HELD uma vez. Sem prova interna: PENDING_RECONCILIATION |
| refunded | Buscar REFUND_EXPECTED com execução externa registrada e mesma transação aprovada | Compatível e PAID: REFUNDED. Preserva estado operacional, nota e estoque consumido. Sem prova interna: PENDING_RECONCILIATION |

`event_type` é o campo do contrato formal. `invoice_type` é metadata não autoritativa. As chaves antigas event/type/status continuam no caminho conservador de compatibilidade. Conteúdo contraditório ou desconhecido não estabelece pagamento. POST isolado, redirect e informações financeiras declaradas pelo browser nunca constituem prova de PAID/cancelamento/estorno.

## Idempotência, abuso e ordem

Fingerprint SHA-256 com namespace/versão, event_type e referências estáveis do pedido/transação/slug/invoice_type; não usa transaction_nsu sozinho. Mesma transação pode ter paid, settled e refunded distintos. Eventos originais são append-only. Receipts continuam únicos por merchant/transação; ledger e match usam ID determinístico da operação esperada. Transações Firestore protegem concorrência, estoque/cupom e estado terminal.

Consulta externa tem coalescência de chamadas simultâneas iguais, lease server-side de 20 segundos e teto de 30 consultas por pedido/minuto. O lease cobre o timeout HTTP de 15 segundos do provider, é liberado com nonce e não depende de Auth público. Duplicata já comprovada usa receipt imutável sem nova consulta. Registro de eventos distintos tem teto de 100 por pedido/hora, com 503/retry; uma execução interna compatível pode ser conciliada mesmo nesse limite. São limites de proteção do endpoint público, não SLA comercial nem confirmação financeira.

Teste fora de ordem: settled antes de paid; tentativas falhas depois de paid; duplicatas concorrentes; refund seguido de paid antigo. Estorno não repõe automaticamente produto já consumido e não cancela nota. Cancelamento tardio de pedido pago exige refund/revisão apropriada, sem falsa devolução de reserva.

## Operação administrativa

CRM → Financeiro → **Conciliação InfinitePay**, com loja explícita. Backend exige Staff ativo, papel de gestão, permissão financeiro e acesso à loja; Customer/grant SMS não servem. Admin Preview não autoriza mutação. Visão Geral não escolhe loja arbitrária.

1. Consultar o paymentId ou notificação, sem dados Customer/credenciais do merchant na resposta.
2. Executar a operação real na App/Conta InfinitePay fora deste sistema, se efetivamente necessária e autorizada pelo responsável. Esta implementação não a executa.
3. Usar “Registrar estorno realizado na InfinitePay” ou cancelamento correspondente. Exigir referência e confirmação explícita de execução concluída. Intenção/planejamento não geram operação apta a conciliar. Para cancelamento ainda se exige paid:false no payment_check; isso sozinho não prova cancelamento.
4. Conferir operação esperada contra a notificação exata. Sem compatibilidade, manter pendente; não falsificar método/status/valor. Operações do provider confirmado são autoridade, não um select manual.
5. Uma notificação sem execução/comprovação pode ser descartada após revisão com motivo. A decisão é outro registro append-only e não altera o evento original ou pagamento.

Modelo privado: `integrations/paymentReconciliation/stores/{storeId}/events`, operations, matches, reviews, audit, ledger e limites. As Rules existentes de integrations negam acesso direto inclusive a Staff. Campos de execução incluem tipo, orderId/orderNsu/transactionNsu, provider/loja, actorUid/role, amount, status, timestamps server-side e matchedAt. Não há tokens de cartão, PAN/CVV/validade, payload bruto ou secrets.

## Relatórios e limites

Os gráficos de recebimentos/fluxo usam estado financeiro explícito para pedidos novos: AGREED_LATER pendente ou método apenas escolhido na nota não equivalem a recebido; REFUNDED/CANCELLED/EXPIRED não entram como receita de pedido. Divergência administrativa após PAID usa paidCents original, não o total novo como se já tivesse sido pago. Históricos sem contrato financeiro explícito conservam o comportamento existente.

A revisão de uma aprovação com valor/pedido incompatível permanece manual e bloqueada; o sistema não altera montante nem inventa prova de pagamento para desbloquear. Lançamentos financeiros manuais históricos não são reescritos. O ledger de conciliação preserva a operação registrada, sem fabricar um segundo recebimento do pedido.

## Evidência e gate

Suítes com Firestore/Auth emulados, provider simulado, eventos forjados, concorrência e falhas estão no checkpoint. Nenhum pagamento/estorno real, emissão fiscal, SMS ou WhatsApp foi executado. Commit, publicação DEV, revisão de segurança e homologação do artefato final são obrigatórios antes de elevar Fase 9 a 100%. Nesta etapa de implementação, mantém 75% e global95,00%.
