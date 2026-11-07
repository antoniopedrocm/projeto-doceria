# Eventos e conciliação InfinitePay V1 — DEV

## Publicação DEV de 07/11/2026

G1/G2/G3 publicados em **`d87174b6`**, API `api-00072-dez` e Hosting `270329a6cd225290`, junto do checkout visitante. [Registro e evidências](GUEST_CHECKOUT_DEV_RELEASE.md). Backend/UI já disponíveis no DEV; 182 testes integrados PASS, sem operação financeira real. Aceite manual dos complementos continua pendente. Percentuais formais inalterados e PROD bloqueada. Estados locais abaixo são históricos.

## Complementos locais de 07/11/2026 — aguardando revisão/publicação

[G1/G2/G3 implementados e testados localmente](INFINITEPAY_G123_LOCAL_FIXES.md). Novos links selecionam os oito eventos em `webhook: {url, events}`, incluindo paid; links existentes mantêm inscrição original. expired/overdue são informativos não verificados, sem transição operacional/financeira. Formulário de refund agora exige escopo Integral e atesto explícito; registro e match exigem `refundScope: FULL`. Parcial/desconhecido/ausente permanece em conciliação administrativa. Histórico matched preservado; pending histórico sem escopo não é promovido. Nenhuma API de refund ou autenticação fictícia do webhook. 142 testes locais PASS; sem commit/push/deploy ou aceite dos complementos. Percentuais formais inalterados. O estado de auditoria abaixo é histórico.

## Estado vigente — confirmação de 06/11/2026 auditada em 07/11

Contrato mais recente: [Ricardo/CloudWalk — 06/11](INFINITEPAY_SUPPORT_CONTRACT_2026-11-06.md). [Auditoria de impacto](INFINITEPAY_CONTRACT_AUDIT_2026-11-06.md): a tabela abaixo descreve o **processador atual**, não comprova que todos os eventos foram selecionados na criação dos links. O payload atual usa somente `webhook_url` (aprovação); `expired/overdue` ficam em HOLD/log, sem registro na fila da loja. Complementos G1/G2 propostos, não implementados. Estorno atual tem escopo integral implícito; não registrar operação parcial por este formulário. G3 propõe atesto e validação explícita de montante integral, sem inventar API de refund ou alterar estado financeiro por webhook isolado.

`/payment_check` é consulta oficial server-side de aprovação; não verifica cancelamento/refund/settled. A API Key não é autenticação do webhook e não é requisito do fluxo simples atual, que não envia options. Suporte não divulga limites/intervalos de reenvio e não exige homologação separada, preservando-se os gates DEV do projeto. Fase 9 formal 100% pelo aceite de 04/11 preservado; compatibilidade ampliada de 06/11 pendente dos complementos. Fase 10 87,50%, global formal 97,00%, Fase 13 0%; PROD bloqueada.

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

Suítes com Firestore/Auth emulados, provider simulado, eventos forjados, concorrência e falhas estão no checkpoint. [Aceite Staff de 04/11](evidence/preprod-mission-2026-11-04/phase9-staff-acceptance-dev.json) concluiu a Fase 9 formal em 100%, com global 97,00%; não houve pagamento/estorno real, emissão fiscal, SMS ou WhatsApp nesse aceite. A confirmação posterior de 06/11 originou G1/G2/G3 documentados acima; os 18 testes locais da auditoria passaram, mas não implementam/homologam esses complementos nem alteram percentuais. Não reiniciar trabalho já aceito e não apresentar o 100% histórico como aprovação de mudanças ainda não feitas.
