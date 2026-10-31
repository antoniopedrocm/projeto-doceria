# Contrato InfinitePay recebido — revisão de 31/10/2026

**CONTRATO OBTIDO.** Duas respostas de Gabriel/InfinitePay de **25/10/2026, 09:14 e 09:37 (UTC−3)** foram localizadas e lidas nesta revisão. A segunda esclarece a assimetria da primeira e prevalece nesse ponto. Não há pendência genérica de “obter o contrato”. O recebimento não implementa nem homologa a Fase 9.

Fontes primárias privadas: [resposta inicial](https://mail.google.com/mail/u/0/#all/1a172fc0a16ba009) e [esclarecimento final](https://mail.google.com/mail/u/0/#all/1a17310c0584bb54), assunto “Dúvidas técnicas sobre webhooks e reconciliação do Checkout Integrado”. Somente leitura; nenhuma mensagem enviada. Este documento resume a especificação recebida, sem copiar headers, assinaturas de e-mail, contatos pessoais ou credenciais.

## Contrato confirmado pelo suporte

| Tema | Resposta recebida e consequência para o projeto |
|---|---|
| Origem | Não há mecanismo documentado de assinatura/HMAC, segredo de header ou allowlist de IP. Webhook é sinal; POST isolado não autoriza efeito financeiro. Não confundir a palavra “assinados” usada incidentalmente na primeira resposta com assinatura criptográfica: ambas as respostas explicitam essa limitação. |
| Aprovação | `paid` deve disparar verificação server-side via `POST https://api.checkout.infinitepay.io/payment_check`, com handle/order_nsu/transaction_nsu/slug completos e correlação aos dados persistidos. Conferir valores/método antes dos efeitos. |
| Falha | `payment_failed` informa tentativa não aprovada; não equivale a estorno nem a falha definitiva de todo o pedido. `paid:false` com referências completas pode corroborar ausência de aprovação; payload incompleto pode dar falso negativo. Não rebaixar pagamento já confirmado. |
| Cancelamento/estorno | Não há consulta autenticada desses estados nem API pública de refund no contrato informado. A equipe opera no App/Conta. Eventos `canceled`/`refunded` precisam corresponder a operação interna esperada e verificável; caso contrário, ficam pendentes de reconciliação/investigação. |
| Liquidação | `settled` é notificação por webhook sem consulta de liquidação via API. Não produz novo pagamento, consumo de estoque ou liberação operacional. Acompanhamento no App/Conta é humano. |
| Envelope | Campo `event_type` distingue eventos; `invoice_type` também integra o publicador. Exemplo de aprovação inclui invoice_slug, valores, parcelas, método, referências, recibo e itens. transaction_nsu pode faltar antes do pagamento. ID único de evento, timestamps, versionamento e ordem garantida não estão documentados. |
| Retry | Duplicidade é possível e a ordem não é garantida. Deduplicação deve distinguir evento e transação. O suporte informa retry limitado sem intervalos/contagem publicados e orientação HTTP 200 no processamento, 400 em erro. A política local de retenção/retry precisa ser especificada/testada, sem inventar garantia de entrega. |
| Formatos | `webhook_url` continua suportado para aprovação; `webhook:{url,events}` permite os seis eventos. Receber todos exige adequar a criação do link; não presumir que o modo simples já os assina/seleciona. |
| Credencial | API Key não é requisito do webhook. O suporte a relaciona a `options` individuais. Não é prova de origem do POST. URLs atuais são api.checkout.infinitepay.io/links e /payment_check. |
| Devolução parcial | Não há semântica específica publicada no contrato recebido; não inferir estorno integral de sinal parcial nem implementar endpoint privado. |

## Trabalho restante, sem execução nesta revisão

Adaptar parser/envelope e seleção dos eventos; especificar operações financeiras esperadas e reconciliação pendente; validar correlação, concorrência, idempotência e ordenação adversa; preservar estado/recibos/estoque/cupom/financeiro. Testar POST forjado e eventos sem referências suficientes. Publicar somente DEV quando a implementação estiver autorizada e pronta; obter aceite DEV antes de marcar Fase 9 como 100%.

Nenhuma assinatura fictícia, endpoint de refund inventado, cobrança/estorno real ou alteração runtime foi realizada. Fase 9 **75%**, global formal **95,00%**, Fase 13 **0%**. PROD bloqueada pelos gates em [PREPROD_GATE_REVIEW.md](PREPROD_GATE_REVIEW.md).
