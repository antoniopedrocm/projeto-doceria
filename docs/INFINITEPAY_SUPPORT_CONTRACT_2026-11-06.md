# Contrato técnico InfinitePay — confirmação CloudWalk de 06/11/2026

## Fonte e vigência desta revisão

Fonte primária: resposta de **Ricardo Cici / CloudWalk**, sexta-feira **06/11/2026, 09:08**, transcrita integralmente pelo proprietário nesta conversa em 07/11. O horário é o apresentado na transcrição; não foram consultados headers ou a caixa de e-mail. Nenhuma mensagem foi enviada ao suporte. Este documento registra a confirmação fornecida, sem contatos pessoais, credenciais ou payloads de clientes.

Complementa o [contrato de 25/10](INFINITEPAY_SUPPORT_CONTRACT_2026-10-25.md) e prevalece em caso de divergência. Não revoga proteções locais, não autoriza acesso PROD e não constitui homologação de código. Documentação pública oficial consultada em 07/11: [Checkout](https://www.infinitepay.io/checkout) e [documentação do Checkout](https://www.infinitepay.io/checkout-documentacao).

## Contrato confirmado

| Tema | Contrato e consequência |
|---|---|
| Autenticidade do webhook | Não há assinatura, HMAC, header secreto ou allowlist de IP documentados. Um POST recebido não é autoridade financeira. Não inventar assinatura ou autenticação de origem. |
| Aprovação | Confirmar no backend com **POST `/payment_check`**, enviando `handle`, `order_nsu`, `transaction_nsu` e `slug`. Correlacionar com o merchant e o pedido persistidos, nunca com valores/handle declarados pelo visitante. |
| Resposta de consulta | Informa pagamento e dados como `success`, `paid`, `amount`, `paid_amount`, `installments` e `capture_method`. Não consulta/lista tentativas falhas, cancelamentos, estornos, liquidação ou devoluções parciais. `paid:false` não prova nenhum desses acontecimentos. |
| Eventos selecionáveis | **`created`, `paid`, `payment_failed`, `refunded`, `canceled`, `expired`, `overdue`, `settled`**. Incluir `paid` explicitamente no objeto de seleção quando aprovações forem desejadas. |
| Envelope dos eventos | Formatos completos e distinção estorno parcial/integral não estão documentados de ponta a ponta. Conservar parsing restrito, limites e estados não verificados; não presumir campos, IDs únicos, timestamps ou ordenação. O campo `event_type` já suportado vem da confirmação anterior; não há evidência de que tenha sido substituído. |
| Modo simples | `webhook_url: "https://..."` permanece válido e notifica apenas pagamento aprovado. Não equivale a assinar todos os eventos financeiros. |
| Modo selecionável | `webhook: {url, events}` permite escolher os eventos. Alterar novos links não atualiza contratos de links antigos; preservar o endpoint legado. |
| Respostas e reenvio | Qualquer resposta **fora de 2xx** pode provocar reenvio. O suporte recomenda 200 para processamento e prefere 400 no erro; **intervalo e quantidade de tentativas não divulgados**. Não afirmar retry limitado ou entrega garantida, nem converter falha transitória em sucesso para encerrar retries. |
| API Key | Prefixo **`inchk_`**, header **`X-Api-Key`**, exclusivamente server-side. Exigida para `options`: `payment_methods_enabled`, `require_delivery_address`, `single_payment`, `valid_until`, `assured_installments`, `discounts`. Criação simples com handle não exige chave. Não é segredo de autenticação do webhook. |
| Cancelamento e estorno | Execução somente no App/Conta Web. Não há API pública de execução ou consulta posterior desses estados por referências do checkout. Reconciliação local deve nomear a fonte humana/operacional da comprovação; não apresentá-la como consulta de refund ao provider. |
| API pública atual | Apenas **POST `/links` e POST `/payment_check`** no domínio `api.checkout.infinitepay.io`. Não usar endpoints internos/privados para completar lacunas. |
| Homologação | O provider não exige homologação separada. Isso não elimina testes, gates DEV, configuração, backup/rollback ou autorização de produção do projeto. |
| Futuro | API mais granular/beta e MCP foram anunciados como futuros. Não são capacidades disponíveis ou dependências do plano atual. |

## Pontos públicos que ajudam a interpretar o contrato

A documentação distingue `amount` original de `paid_amount`, que pode ser maior por encargos de parcelamento; não exigir igualdade entre ambos. Também descreve a necessidade de manter URLs antigas de webhook e que opções de expiração/uso único exigem chave. O comportamento atual de expiração de reserva local não encerra um link no provider. [Documentação oficial](https://www.infinitepay.io/checkout-documentacao).

A página pública ainda enumera seis eventos no formulário/exemplo. Para a lista de oito desta revisão, a fonte é **a resposta formal de 06/11 transcrita pelo Dono**, não uma inferência do formulário. Nenhum exemplo de payload para `expired`/`overdue` foi inventado.

## Situação do projeto

### Complemento público de 08/11/2026 — seleção de meios não equivale a Pix-only

A revisão das mesmas páginas oficiais para a missão de pagamento por modalidade encontrou uma restrição explícita: `payment_methods_enabled` não permite desabilitar cartão no Checkout Integrado; a seleção controla a inclusão do Pix. Não inferir Pix-only de `['pix']` nem da disponibilidade de API Key/options na resposta de 06/11. Isso complementa a transcrição, sem atribuir ao suporte uma afirmação que não fez. [Diagnóstico, fallback seguro e limites](CHECKOUT_PAYMENT_BY_ACCESS.md). Sem alteração dos percentuais ou teste real de cobrança.

[Auditoria de impacto no código existente](INFINITEPAY_CONTRACT_AUDIT_2026-11-06.md), [modelo de conciliação](INFINITEPAY_RECONCILIATION_V1.md), [checkpoint](CHECKPOINT_PREPROD_MISSION.md). Fase 9 **100% formal conforme aceite anterior**, Fase 10 **87,50%**, global formal **97,00%**, Fase 13 **0%**. Esta atualização não aumenta percentuais nem homologa complementos identificados. **PROD READY: NÃO.**
