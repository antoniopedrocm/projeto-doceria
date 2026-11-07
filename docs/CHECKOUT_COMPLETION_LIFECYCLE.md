# Checkout — finalizar a compra e iniciar a próxima do zero

## Decisão do Dono — 07/11/2026

Ao clicar Confirmar Pedido, concluir o checkout normalmente, como no fluxo autenticado/telefone; a próxima compra começa do início. A proposta de adicionar **Encerrar tentativa online e continuar** foi substituída por essa orientação. **Não criar encerramento/cancelamento financeiro ou novo endpoint de cancelamento.**

Base conferida `0112003a`, worktree DEV `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, Firebase exclusivo `crmdoceria-9959e`. Patch de frete local da execução anterior preservado e incorporado, sem repetir operações reais. Autorização vigente de publicar os ajustes do checkout no DEV; PROD permanece vedada.

## Causa raiz corrigida

`cardapio.html::finalizeOrder` recebia confirmação do servidor e executava um retorno antecipado com `redirectToPayment` no ramo online, **antes da limpeza do carrinho/rascunho e da chave idempotente**. O ramo offline fazia a limpeza depois. A compra seguinte herdava a chave de uma compra já registrada, e o backend corretamente rejeitava dados diferentes com 409. O aviso de `4a19dba2` expunha esse conflito, mas não corrigia o ciclo que o originava.

## Contrato da finalização

1. Confirmar Pedido mantém o mesmo POST/validações/identidade da loja. Nenhuma chave é rotacionada por erro de rede, ausência de resposta válida ou simples edição dos campos.
2. Depois de `ok:true`/ID válido do servidor, `completeCheckoutAttempt` guarda recibo mínimo por ID e mantém a prova de retorno do pagamento separada da chave da submissão. Recibo não contém contato/endereço/token de cartão e não afirma que houve pagamento.
3. Só a chave correspondente à resposta é retirada. Rascunho persistido da mesma loja é removido **antes da chave**, prevenindo restauração do carrinho velho com uma chave nova se houver interrupção. Resposta antiga não apaga tentativa nova nem carrinho de outra loja.
4. `finishConfirmedCheckout` limpa carrinho, cupom, frete, detalhes do pedido, formulário Guest/estado de endereço e consentimento; fecha o formulário e restaura a escolha inicial. Preserva identidade autenticada conforme o helper já existente, permissões e prova de pagamento.
5. **Combinar:** confirmação normal existente; pedido PENDING, método indefinido e nenhum link online. WhatsApp segue seu contrato anterior.
6. **Pagar Agora:** `redirectToPayment` valida o destino, salva a prova e executa a mesma limpeza **antes da navegação**. Criar pedido/link não significa PAID; confirmação financeira permanece exclusivamente no servidor. Nenhum WhatsApp antecipado.
7. Nova compra exige novo carrinho e recebe nova chave; clique repetido com carrinho concluído não envia outro pedido. Retry de submissão sem resposta preserva a chave e usa a idempotência do servidor.

## Recuperação de sessões da versão anterior

Se a chave antiga já possui paymentId, consulta autorizada por prova de retorno identifica o pedido correspondente. O status inclui agora somente o **storeId público canônico**, além dos campos já autorizados, para vincular a recuperação à loja certa. Nenhum nome, telefone, endereço, Customer ou dado financeiro privado foi adicionado ao retorno.

Pedido reconhecido como registrado finaliza o carrinho residual; não reenvia o pedido com Combinar, não troca o método e não cancela o pagamento. A confirmação informa **Pedido já registrado** e oferece consulta ao pagamento anterior. Depois, produtos adicionados formam uma nova compra. Recibo de outra loja pode ser arquivado, mas não apaga o carrinho da loja atual. Estado desconhecido/prova ausente/erro preserva a tentativa, com mensagem controlada.

O estado financeiro anterior (inclusive PENDING ou revisão) continua sob o contrato vigente; não é modificado pela limpeza local. Reserva/expiração, payment_check, webhook, merchant/provider persistido, financeiro e conciliação continuam iguais. Um retorno PAID antigo não apaga a chave de uma compra nova.

## Frete

Incorporado o patch descrito em [cotação após refresh](CHECKOUT_FREIGHT_REFRESH_AND_PAYMENT_EXIT.md): não persistir/restaurar cotação, recalcular endereço retomado, exibir total parcial até cotação válida, ignorar respostas atrasadas, invalidar ao trocar endereço/contexto e após finalizar/recomprar. Rascunho e carrinho não são confundidos com preço validado. Não altera tarifas, raio, Maps ou backend de cálculo. Evidência de 71 testes daquela etapa é histórica; contagem desta entrega está na evidência atual, sem somar retestes.

## Arquivos

- `crm/public/cardapio.html` e três aliases gerados: finalização compartilhada, recuperação delimitada e cotação.
- `crm/public/guest-payment-attempt.mjs`: recibo/retirada segura da chave e recuperação por prova; sem API financeira nova.
- `crm/public/checkout-payment-client.js`: callback de limpeza antes da navegação validada.
- `crm/public/payment-return.js`: referência de último pagamento e proteção da tentativa nova ao consultar pagamento antigo.
- `functions/checkout-payment.js`: apenas storeId canônico na resposta de status; lógica financeira intacta.
- Testes públicos de ciclo/frete/Guest/endereços, HTTP emulado e WhatsApp; roteiros visuais locais e documentação.

## Validação e entrega

Rodada final: **234 testes relevantes distintos PASS** — 69 públicos, 93 emulados (9 arquivos), 35 unitários/WhatsApp e 37 de hydration/entrada/retorno. Retestes e totais anteriores não foram somados. Build DEV PASS (bundle React inalterado, 456,38 kB gzip); lint sem diagnósticos novos (débitos históricos preservados), diff-check PASS. Aliases e sete arquivos públicos correspondem ao build. Desktop/mobile e quatro verificações de reload normal/hard passaram no Chrome isolado com fixtures; não equivalem a aceite real.

Testes sintéticos cobrem pedido online → limpeza → nova compra Combinar, novo nonce, retry/duplo clique, respostas perdidas/inválidas/atrasadas, outra loja, armazenamento indisponível, referência de pagamento anterior, Auth/Phone, estoque reservado uma vez por compra legítima e sem cancelamento da anterior. Testes financeiros/rules existentes também executados em emuladores locais. Nenhuma cobrança, pedido real, estorno, SMS, vínculo ou WhatsApp.

[Evidência atual](evidence/checkout-cycle-local/validation.json), [visual local desktop/mobile](evidence/checkout-cycle-local/visual-review.json), [frete/reload no Chrome isolado](evidence/checkout-freight-refresh-local/browser-review.json). Capturas são fixtures; não representam aceite do titular no DEV. Build guardado para DEV, lint do delta e diff-check obrigatórios. Deploy necessário: somente API (metadado storeId) + Hosting, sem Rules/índices/outras Functions.

**Aceite manual DEV pendente; FAIL anterior preservado. Fase 9 100%; Fase 10 87,50%; global formal 97,00%; Fase 13 0%; PROD READY NÃO.**
