# Contrato financeiro — evidências, estados e limites

Auditoria local em 2026-10-20, base `c518597c`, branch DEV `feature/infinitepay-customer-auth`.
Este documento não autoriza transações, estornos, escritas financeiras remotas ou publicação.

**Reavaliação documental em 2026-10-20:** o artigo oficial10766888 atual confirma
os eventos created, paid, settled, canceled, refunded e payment_failed. Portanto a
ausência anterior da definição desses eventos não é mais a pendência. Continua
faltando prova verificável de origem e contrato de confirmação dos eventos não pagos.
Matriz, fontes atuais, diferenças do modo legado e testes em
[INFINITEPAY_WEBHOOK_REASSESSMENT.md](INFINITEPAY_WEBHOOK_REASSESSMENT.md).

## Critério oficial e fontes

A Fase 9 tem quatro marcos iguais: verificação/correlação; idempotência/conferência;
recuperação/registro de tentativas; contrato e tratamento operacional dos estados definitivos restantes.
Os três primeiros estavam concluídos. O último estava pendente no plano oficial.

Fontes primárias consultadas nesta auditoria:

- [Checkout InfinitePay](https://www.infinitepay.io/checkout-documentacao): criação de link,
  `order_nsu`, retorno com referências, webhook de aprovação e `payment_check` com
  `success`, `paid`, `amount`, `paid_amount` e `capture_method`.
- [Cancelamento no app InfinitePay](https://ajuda.infinitepay.io/pt-BR/articles/6088742-como-cancelar-uma-venda-no-app-infinitepay):
  procedimento financeiro externo e irreversível. Não é contrato de evento/API de estorno do Checkout.

Na consulta anterior não havia sido obtida a definição dos novos eventos. A fonte
adicional agora os define; ainda não foi localizado schema/autenticação verificável
nem consulta específica para estados não pagos. Não afirmar inexistência de contrato
privado. Mocks não substituem esses elementos externos.

## Autoridade e transições

| Evidência | Contrato da aplicação | Efeitos permitidos |
|---|---|---|
| Redirect ou webhook isolado | Pista para consulta server-side | Não confirma, não consome reserva e não altera por si só o financeiro |
| `success:true`, `paid:true`, valor e método conciliados por consulta server-side | `PAID` | Só confirma operacionalmente com pedido/reserva válidos e ainda elegíveis |
| `paid:false`, erro HTTP/rede, resposta ilegível, abandono ou navegador fechado | Não comprova falha definitiva ou estorno | Preserva estado financeiro; não deriva `FAILED`/`REFUNDED` |
| Prazo local vencido com reserva `HELD` elegível | `EXPIRED` e pedido `CANCELLED` | Libera reserva uma única vez; não cancela link no provider |
| Prova de pagamento após vencimento/cancelamento/liberação | `PAID` + `requiresReview:true`, pedido cancelado | Não reabre pedido; não debita estoque/cupom novamente |
| Valor/método/vínculo divergente ou segunda transação | Recibo `REVIEW`, `requiresReview:true` | Bloqueia continuidade automática; não confirma outro pedido |
| Cancelar operacionalmente pedido pago | Pagamento continua `PAID`, com revisão | Não é estorno e não devolve automaticamente estoque consumido |
| Registro interno já `REFUNDED` e evidência antiga de aprovação | Preserva `REFUNDED` e estado operacional | Recibo existente é idempotente; evidência adicional sem recibo é auditada para revisão, sem voltar a `PAID` |

`REVIEW` é o resultado do recibo e/ou sinal `requiresReview`, não um novo
`payment_status` do provider. Ele não afirma que houve reembolso ou que o dinheiro deixou de existir.

### FAILED

`payment_failed` existe oficialmente como tentativa não aprovada. Isso não comprova
falha definitiva de todo o pedido. A aplicação não produz `FAILED` automaticamente
a partir de `paid:false`, erro de transporte ou nome de evento não autenticado.
Antes de uma transição adicional faltam origem verificável/schema e semântica de
tentativa/retry. Estados históricos não comprovam recebimento de eventos reais.

### REFUNDED

O significado interno é reembolso financeiro efetivamente comprovado para aquele
pagamento, não pedido cancelado, solicitação de cancelamento, saldo não recebido
ou link fechado. Uma comprovação operacional precisaria identificar loja/conta,
pedido, transação, valor/moeda, conclusão do reembolso e referência auditável.
Uma devolução parcial não comprova devolução integral.

O evento `refunded` também é oficialmente definido. Seu recebimento sem prova de
origem não autoriza a transição interna. O código atual não contém endpoint de reembolso nem mecanismo operacional aprovado
para registrar essa comprovação na aplicação. Não foi criado um gravador financeiro
baseado em declaração livre do navegador, e não foram abertas Rules para isso.
A proteção de um registro interno histórico `REFUNDED` não certifica a origem desse
estado nem a execução de reembolso real. Nenhum reembolso foi realizado nesta auditoria.

## Correlação e idempotência

- A consulta usa `handle` persistido na tentativa original, `order_nsu` canônico,
  `transaction_nsu` e slug. Troca posterior de conta recebedora não redireciona a conciliação.
- O contrato público de resposta não ecoa todos esses identificadores; a correlação
  depende da consulta com as referências completas e da integridade do vínculo local.
- `orderPath` deve ser `lojas/{storeId}/pedidos/{orderId}`. IDs explícitos persistidos
  devem concordar com o caminho. Registros legados sem esses campos usam apenas
  a identidade do próprio caminho, sem fallback para outra loja.
- Quando presentes, `paymentId`, loja e proprietário do pedido devem concordar
  com o pagamento. Um pedido contraditório não é modificado: o pagamento fica em revisão.
- Mudança de loja, pedido, proprietário, conta ou valor enquanto a consulta está
  em andamento invalida a tentativa, sem aplicar resposta antiga ao novo vínculo.
- Valores são centavos inteiros; a integração adotada é BRL. A resposta documentada
  não traz campo de moeda: não inventar validação de um campo inexistente nem suporte multimoeda.
  `paid_amount` pode exceder `amount`, como no exemplo oficial; isso não prova estorno.
- Recibo por conta/transação impede reaproveitamento em outro pagamento. Repetição
  preserva recibo e efeitos; uma transação adicional exige revisão.
- Webhook e consulta autenticada usam o mesmo serviço. Ambas as ordens de chegada
  são testadas pelas rotas HTTP reais locais. Resposta posterior não paga não regride `PAID`.

## Criação ambígua e retomada

`CREATING` é reivindicado transacionalmente antes do POST de criação. Resultado
ambíguo passa a `RECONCILIATION_REQUIRED`; retry não cria outro link/cobrança.
A mesma intenção/chave continua vinculada ao pedido. Com URL persistida, a retomada
reutiliza a URL; com referências válidas, webhook/consulta podem reconciliar.
Sem URL/referências suficientes, é necessária conferência operacional: não existe
lookup adicional documentado para inventar, nem retry cego autorizado.

O prazo da reserva continua local. O cliente não deve pagar link expirado nem
refazer pagamento em revisão. Notificação online é reivindicada uma vez; resultado
ambíguo não dispara novo envio automático. Nada exige WhatsApp real.

## Resultado e pendência formal

Seis regressões transacionais novas cobrem vínculo contraditório, pedido alheio de
mesmo valor, preservação de `REFUNDED`, respostas sem prova, idempotência e evento
não pago antigo. Três falharam antes da correção e passaram depois. A bateria
financeira emulada de contratos/reservas/configuração/Rules passou 27/27.
As rotas HTTP exercitam webhook → consulta e consulta → webhook, com repetição e
preservação de estoque/recibo. Todo provider financeiro é simulado explicitamente.

**Fase 9 permanece 75%:** existência dos eventos agora documentada; as correções e
provas locais não substituem autenticação verificável/consulta específica e o
tratamento operacional ainda pendentes. Não presumir API de refund/cancelamento.
Não exigir um novo Pix ou um estorno real apenas para repetir cenários homologados.
Próxima dependência: obter contrato/evidência oficial suficiente e definir o mecanismo
operacional autorizado de registro/conciliação, com testes, sem confiar em status
enviado pelo cliente. Caso uma ação financeira real venha a ser indispensável,
deverá ter valor/pedido/loja/efeito e autorização específicos antes de executá-la.
